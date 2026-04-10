// ============================================================
// MODULO: ServerIndex v2.5.1 — ORCHESTRATORE DEFINITIVO
// AGGIORNAMENTO: Aggiunto mount /api/git (M15 GitRouter)
// ============================================================

import { WorkspaceManager } from './WorkspaceManager'
import { SSEManager, SSEEventType } from './SSEManager'
import { CostTracker } from './CostTracker'
import { BunRouter } from './BunRouter'
import { AuthMiddleware } from './AuthMiddleware'
import { RateLimiter } from './RateLimiter'
import { createWorkspaceRouter } from './routes/workspace'
import { createAgentRouter } from './routes/agent'
import { createBuddyRouter } from './routes/buddy'
import { createSkillsRouter } from './routes/skills'
import { createVoiceRouter } from './routes/voice'
import { createGitRouter } from './routes/git'
import { createRemoteRouter } from './routes/remote'
import { RemoteManager } from '../remote/RemoteManager'
import path from 'path'

const PORT           = parseInt(process.env.PORT            ?? '3001')
const WORKSPACE_PATH = process.env.WORKSPACE_PATH           ?? process.cwd()
const AUTH_TOKEN     = process.env.CAMELOT_AUTH_TOKEN       ?? ''
const CORS_ORIGIN    = process.env.CORS_ORIGIN              ?? 'http://localhost:3000'
const RATE_MAX       = parseInt(process.env.RATE_MAX        ?? '100')
const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS  ?? '60000')

interface TerminalWSData {
  sessionId: string
  shell: ReturnType<typeof Bun.spawn> | null
}

async function bootstrap(): Promise<void> {
  if (!AUTH_TOKEN) {
    console.warn('⚠️  CAMELOT_AUTH_TOKEN non impostato — auth disabilitata (dev mode)')
  }

  const workspace = WorkspaceManager.getInstance(WORKSPACE_PATH)
  const sse       = SSEManager.getInstance()
  const costs     = CostTracker.getInstance()
  const remote    = RemoteManager.getInstance()

  // Avvio tunnel asincrono
  remote.start()

  const auth = new AuthMiddleware({
    token: AUTH_TOKEN || 'dev-insecure-token',
    allowPublicRoutes: true,
    publicPaths: [
      '/api/health', '/api/status',
      '/api/events', '/api/workspace/events'
    ]
  })

  const rateLimiter = new RateLimiter({
    maxRequests:     RATE_MAX,
    windowMs:        RATE_WINDOW_MS,
    autoBlock:       true,
    blockDurationMs: 5 * 60_000
  })

  const router = new BunRouter()

  router.get('/api/health', async () =>
    Response.json({
      ok: true, version: '2.5.1',
      workspace: workspace.getRootPath(),
      sseClients: sse.getClientCount(),
      ts: Date.now()
    })
  )
  router.get('/api/status', async () =>
    Response.json({ ok: true, version: '2.5.1', ts: Date.now() })
  )
  router.get('/api/events', async () => sse.createResponse())

  router.mount('/api/workspace', createWorkspaceRouter(workspace, sse))
  router.mount('/api/agent',     await createAgentRouter(sse, costs))
  router.mount('/api/buddy',     createBuddyRouter(sse, costs))
  router.mount('/api/skills',    createSkillsRouter(workspace, sse))
  router.mount('/api/voice',     createVoiceRouter(sse))
  router.mount('/api/git',       createGitRouter(workspace, sse))   // ← M15
  router.mount('/api/remote',    createRemoteRouter(auth))          // ← M19

  // Root Redirect
  router.get('/', async () => Response.redirect('/dashboard/index.html', 302))

  // Dashboard Static Mount (M18)
  router.get('/dashboard/*', async (req) => {
    const url  = new URL(req.url)
    const file = url.pathname.replace('/dashboard', '') || '/index.html'
    // Serviamo index.html se il file non ha estensione (SPA fallback parziale)
    const filePath = file.includes('.') ? file : '/index.html'
    return new Response(Bun.file(path.join('src/dashboard', filePath)))
  })

  router.get('/api/costs',        auth.protect(async () => Response.json(costs.getSummary())))
  router.post('/api/costs/reset', auth.protect(async () => { costs.reset(); return Response.json({ ok: true }) }))

  const server = Bun.serve<TerminalWSData>({
    port:     PORT,
    hostname: '0.0.0.0',
    idleTimeout: 255, // Aumenta timeout a 255 sec per lunghe valutazioni di prompt

    async fetch(req, server) {
      const url = new URL(req.url)
      const ip  = RateLimiter.getIP(req)

      const rateResult = rateLimiter.check(ip)
      if (!rateResult.allowed) return rateLimiter.tooManyResponse(rateResult)

      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() })
      }

      if (url.pathname === '/api/terminal/ws') {
        if (AUTH_TOKEN && !auth.verify(req)) {
          return new Response('Non autorizzato', { status: 401 })
        }
        const sessionId = url.searchParams.get('session') ?? crypto.randomUUID()
        const upgraded  = server.upgrade(req, {
          data: { sessionId, shell: null } as TerminalWSData
        })
        if (upgraded) return undefined
        return new Response('WebSocket upgrade fallito', { status: 400 })
      }

      const response = await router.handle(req)
      return addHeaders(response)
    },

    websocket: {
      open(ws) {
        const { sessionId } = ws.data
        console.log(`[Terminal] Aperto: ${sessionId}`)
        const shell = Bun.spawn(
          ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive'],
          {
            stdin:  'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
            env:    { ...process.env, TERM: 'xterm-256color' }
          }
        )
        ws.data.shell = shell
        const pump = async (stream: ReadableStream<Uint8Array>, type: 'stdout' | 'stderr') => {
          const reader = stream.getReader()
          const dec    = new TextDecoder()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type, data: dec.decode(value) }))
              }
            }
          } catch { /* ws chiuso */ }
        }
        pump(shell.stdout, 'stdout')
        pump(shell.stderr, 'stderr')
        sse.emit(SSEEventType.TERMINAL_OUTPUT, {
          sessionId,
          data: `[Terminale pronto — sessione: ${sessionId}]\r\n`
        })
      },
      message(ws, message) {
        const { shell } = ws.data
        if (!shell?.stdin) return
        try {
          const payload = JSON.parse(String(message)) as { type: string; data: string }
          if (payload.type === 'input') (shell.stdin as any).write(payload.data)
          if (payload.type === 'kill')  shell.kill()
        } catch {
          if (typeof message === 'string') (shell.stdin as any).write(message)
        }
      },
      close(ws) {
        const { sessionId, shell } = ws.data
        shell?.kill()
        ws.data.shell = null
        console.log(`[Terminal] Chiuso: ${sessionId}`)
        sse.emit(SSEEventType.TERMINAL_CLOSED, { sessionId, ts: Date.now() })
      },
      drain(ws) {
        console.debug(`[Terminal] Drain: ${ws.data.sessionId}`)
      }
    },

    error(err) {
      console.error('[Server] Errore:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  console.log(`\n✅ Camelot-IDE Server v2.5.1`)
  
  const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
  const ollamaModel = process.env.OLLAMA_MODEL ?? 'gemma4:latest'
  try {
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (r.ok) console.log(`   ✅ Ollama online → usando ${ollamaModel}`)
    else throw new Error()
  } catch {
    console.log(`   ⚠️ Ollama offline → fallback OpenRouter`)
  }

  console.log(`   🌐 URL:         http://localhost:${server.port}`)
  console.log(`   📁 Workspace:   ${WORKSPACE_PATH}`)
  console.log(`   📡 SSE:         http://localhost:${server.port}/api/events`)
  console.log(`   🖥️  Terminal WS: ws://localhost:${server.port}/api/terminal/ws`)
  console.log(`   🤖 Agent:       http://localhost:${server.port}/api/agent/provider`)
  console.log(`   🔥 Buddy:       http://localhost:${server.port}/api/buddy/status`)
  console.log(`   🔱 Git:         http://localhost:${server.port}/api/git/status
   🖥️  Dashboard:   http://localhost:${server.port}/dashboard/index.html
   🌐 Remote:      http://localhost:${server.port}/api/remote/status
   🔑 Auth:        ${AUTH_TOKEN ? 'ABILITATA' : '⚠️ DISABILITATA'}\n
`)

  sse.emit(SSEEventType.SERVER_READY, { port: server.port, ts: Date.now(), version: '2.5.1' })

  process.on('SIGINT',  () => shutdown(workspace, sse, rateLimiter))
  process.on('SIGTERM', () => shutdown(workspace, sse, rateLimiter))
}

function shutdown(w: WorkspaceManager, s: SSEManager, r: RateLimiter): never {
  console.log('\n🛑 Shutdown...')
  s.destroy(); w.destroy(); r.destroy()
  process.exit(0)
}

function addHeaders(response: Response): Response {
  const h = new Headers(response.headers)
  for (const [k, v] of Object.entries({ ...corsHeaders(), ...securityHeaders() })) h.set(k, v)
  return new Response(response.body, { status: response.status, headers: h })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':      CORS_ORIGIN,
    'Access-Control-Allow-Methods':     'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization, X-Session-Id',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options':  'nosniff',
    'X-Frame-Options':         'DENY',
    'X-XSS-Protection':        '1; mode=block',
    'Referrer-Policy':         'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://cdn.jsdelivr.net https://unpkg.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: fonts.gstatic.com",
      "worker-src 'self' blob:",
    ].join('; ')
  }
}

bootstrap().catch(err => {
  console.error('❌ Errore bootstrap:', err)
  process.exit(1)
})
