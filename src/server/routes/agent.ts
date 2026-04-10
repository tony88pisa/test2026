// ============================================================
// MODULO: AgentRouter v2.0 — Ollama-First
// REGOLA: Gestisce tutte le query agentiche.
//         PROVIDER LOGIC:
//           1. SEMPRE Ollama locale (gemma4:latest)
//           2. Fallback OpenRouter SOLO se Ollama offline
//         Streaming token via SSE (SSEEventType.AI_TOKEN).
//         VIETATO chiamare provider AI direttamente fuori da qui.
// DIPENDENZE: SSEManager (M2), CostTracker (M5), BunRouter (M6b)
// ENV: OLLAMA_BASE_URL, OLLAMA_MODEL, OPENROUTER_API_KEY (opzionale)
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import { BunRouter } from '../BunRouter'
import { SSEManager, SSEEventType } from '../SSEManager'
import { CostTracker } from '../CostTracker'

// ── Configurazione provider ───────────────────────────────────────────────────
const OLLAMA_BASE      = process.env.OLLAMA_BASE_URL    ?? 'http://localhost:11434'
const DEFAULT_MODEL    = process.env.OLLAMA_MODEL       ?? 'gemma4:latest'
const OPENROUTER_KEY   = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL   ?? 'qwen/qwen3.6-plus:free'
const SITE_URL         = process.env.SITE_URL           ?? 'http://localhost:3001'

interface Provider {
  name:          string
  baseUrl:       string
  model:         string
  headers:       Record<string, string>
  isOpenAICompat: boolean
}

// Provider cache — rilevato una sola volta all'avvio
let _cachedProvider: Provider | null = null

function ollamaProvider(): Provider {
  return {
    name:           `Ollama (${DEFAULT_MODEL})`,
    baseUrl:        OLLAMA_BASE,
    model:          DEFAULT_MODEL,
    headers:        { 'Content-Type': 'application/json' },
    isOpenAICompat: false,
  }
}

function openRouterProvider(): Provider {
  return {
    name:           'OpenRouter',
    baseUrl:        'https://openrouter.ai/api/v1',
    model:          OPENROUTER_MODEL,
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer':  SITE_URL,
      'X-Title':       'Camelot-IDE',
      'Content-Type':  'application/json',
    },
    isOpenAICompat: true,
  }
}

// Rileva provider all'avvio — Ollama prima, OpenRouter come fallback
async function detectProvider(): Promise<Provider> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    if (res.ok) {
      console.log(`   ✅ Ollama online → usando ${DEFAULT_MODEL}`)
      return ollamaProvider()
    }
  } catch {
    console.log('   ⚠️  Ollama non raggiungibile')
  }

  if (OPENROUTER_KEY) {
    console.log('   🌐 Fallback → OpenRouter')
    return openRouterProvider()
  }

  console.log('   ❌ Nessun provider disponibile — uso Ollama (potrebbe non rispondere)')
  return ollamaProvider()
}

function getProvider(): Provider {
  return _cachedProvider ?? ollamaProvider()
}

export interface AgentQueryRequest {
  input:         string
  model?:        string
  sessionId:     string
  history?:      Array<{ role: 'user' | 'assistant'; content: string }>
  systemPrompt?: string
  stream?:       boolean
}

export interface ChatMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

export function createAgentRouter(
  sse:   SSEManager,
  costs: CostTracker
): BunRouter {
  const router = new BunRouter()

  // Inizializza provider all'avvio (asincrono, una sola volta)
  detectProvider().then(p => { _cachedProvider = p })

  // GET /api/agent/health
  router.get('/health', async (_req, _params) => {
    const provider = getProvider()
    try {
      if (provider.isOpenAICompat) {
        const res = await fetch(`${provider.baseUrl}/models`, { headers: provider.headers })
        return Response.json({ ok: res.ok, provider: provider.name, model: provider.model, mode: 'openrouter' })
      } else {
        const res  = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { models: Array<{ name: string }> }
        const models = (data.models ?? []).map(m => m.name)
        return Response.json({ ok: true, provider: provider.name, model: provider.model, mode: 'ollama', models })
      }
    } catch (err) {
      return Response.json({ ok: false, provider: provider.name, error: String(err) }, { status: 503 })
    }
  })

  // GET /api/agent/provider
  router.get('/provider', async (_req, _params) => {
    const p = getProvider()
    return Response.json({
      provider:        p.name,
      model:           p.model,
      mode:            p.isOpenAICompat ? 'openrouter' : 'ollama',
      openrouterReady: !!OPENROUTER_KEY,
      ollamaUrl:       OLLAMA_BASE,
    })
  })

  // POST /api/agent/query — Query con streaming SSE
  router.post('/query', async (req, _params) => {
    let sessionId = ''
    try {
      let body: AgentQueryRequest
      try {
        body = await req.json() as AgentQueryRequest
      } catch {
        return Response.json({ error: 'Body JSON non valido' }, { status: 400 })
      }

      const { input, history = [], systemPrompt, stream = true } = body
      sessionId = body.sessionId ?? ''

      if (!input?.trim()) return Response.json({ error: '"input" richiesto' },    { status: 400 })
      if (!sessionId)     return Response.json({ error: '"sessionId" richiesto' }, { status: 400 })

      const provider = getProvider()
      const model    = body.model ?? provider.model

      const messages: ChatMessage[] = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      for (const msg of history) messages.push({ role: msg.role, content: msg.content })
      messages.push({ role: 'user', content: input })

      sse.emit(SSEEventType.AI_THINKING, { sessionId, model, provider: provider.name, ts: Date.now() })

      if (provider.isOpenAICompat) {
        return stream
          ? streamOpenAI({ messages, model, sessionId, provider, sse, costs })
          : completeOpenAI({ messages, model, sessionId, provider, sse, costs })
      } else {
        return stream
          ? streamOllama({ messages, model, sessionId, sse, costs })
          : completeOllama({ messages, model, sessionId, sse, costs })
      }
    } catch (err) {
      // SEMPRE sblocca il client in caso di errore imprevisto
      if (sessionId) {
        sse.emit(SSEEventType.AI_ERROR, { sessionId, error: String(err), ts: Date.now() })
      }
      return Response.json({ error: String(err) }, { status: 502 })
    }
  })

  // POST /api/agent/interrupt
  router.post('/interrupt', async (req, _params) => {
    const { sessionId } = await req.json() as { sessionId: string }
    sse.emit(SSEEventType.AI_ERROR, { sessionId, error: 'Interrotto dall\'utente', ts: Date.now() })
    return Response.json({ ok: true, sessionId })
  })

  return router
}

// ─── OpenRouter / OpenAI-compat streaming ────────────────────────────────────

async function streamOpenAI(opts: {
  messages:  ChatMessage[]
  model:     string
  sessionId: string
  provider:  Provider
  sse:       SSEManager
  costs:     CostTracker
}): Promise<Response> {
  const { messages, model, sessionId, provider, sse, costs } = opts
  let fullResponse = ''
  let inputTokens  = 0
  let outputTokens = 0

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: provider.headers,
      body:    JSON.stringify({ model, messages, stream: true })
    })
    if (!res.ok || !res.body) throw new Error(`OpenRouter HTTP ${res.status}`)

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
            usage?:   { prompt_tokens?: number; completion_tokens?: number }
          }
          const token = chunk.choices?.[0]?.delta?.content ?? ''
          if (token) {
            fullResponse += token
            sse.emit(SSEEventType.AI_TOKEN, { sessionId, token, accumulated: fullResponse })
          }
          if (chunk.usage) {
            inputTokens  = chunk.usage.prompt_tokens     ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
          }
        } catch { /* SSE chunk non JSON */ }
      }
    }

    costs.track({ inputTokens, outputTokens, model, sessionId })
    sse.emit(SSEEventType.AI_DONE, { sessionId, response: fullResponse, inputTokens, outputTokens, ts: Date.now() })
    return Response.json({ ok: true, sessionId, response: fullResponse, inputTokens, outputTokens, provider: provider.name })

  } catch (err) {
    sse.emit(SSEEventType.AI_ERROR, { sessionId, error: String(err), ts: Date.now() })
    return Response.json({ error: String(err) }, { status: 502 })
  }
}

async function completeOpenAI(opts: {
  messages:  ChatMessage[]
  model:     string
  sessionId: string
  provider:  Provider
  sse:       SSEManager
  costs:     CostTracker
}): Promise<Response> {
  const { messages, model, sessionId, provider, sse, costs } = opts
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: provider.headers,
      body:    JSON.stringify({ model, messages, stream: false })
    })
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`)
    const data = await res.json() as {
      choices?: Array<{ message?: { content: string } }>
      usage?:   { prompt_tokens?: number; completion_tokens?: number }
    }
    const response     = data.choices?.[0]?.message?.content ?? ''
    const inputTokens  = data.usage?.prompt_tokens     ?? 0
    const outputTokens = data.usage?.completion_tokens ?? 0

    costs.track({ inputTokens, outputTokens, model, sessionId })
    sse.emit(SSEEventType.AI_DONE, { sessionId, response, inputTokens, outputTokens, ts: Date.now() })
    return Response.json({ ok: true, sessionId, response, inputTokens, outputTokens, provider: provider.name })
  } catch (err) {
    sse.emit(SSEEventType.AI_ERROR, { sessionId, error: String(err), ts: Date.now() })
    return Response.json({ error: String(err) }, { status: 502 })
  }
}

// ─── Ollama streaming ─────────────────────────────────────────────────────────

async function streamOllama(opts: {
  messages:  ChatMessage[]
  model:     string
  sessionId: string
  sse:       SSEManager
  costs:     CostTracker
}): Promise<Response> {
  const { messages, model, sessionId, sse, costs } = opts
  let fullResponse = ''
  let inputTokens  = 0
  let outputTokens = 0

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, messages, stream: true })
    })
    if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`)

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as {
            message?: { content: string }
            done?: boolean
            prompt_eval_count?: number
            eval_count?: number
          }
          if (chunk.message?.content) {
            fullResponse += chunk.message.content
            sse.emit(SSEEventType.AI_TOKEN, { sessionId, token: chunk.message.content, accumulated: fullResponse })
          }
          if (chunk.done) {
            inputTokens  = chunk.prompt_eval_count ?? 0
            outputTokens = chunk.eval_count        ?? 0
          }
        } catch { /* chunk non JSON valido */ }
      }
    }

    costs.track({ inputTokens, outputTokens, model, sessionId })
    sse.emit(SSEEventType.AI_DONE, { sessionId, response: fullResponse, inputTokens, outputTokens, ts: Date.now() })
    return Response.json({ ok: true, sessionId, response: fullResponse, inputTokens, outputTokens, provider: 'Ollama' })

  } catch (err) {
    sse.emit(SSEEventType.AI_ERROR, { sessionId, error: String(err), ts: Date.now() })
    return Response.json({ error: String(err) }, { status: 502 })
  }
}

async function completeOllama(opts: {
  messages:  ChatMessage[]
  model:     string
  sessionId: string
  sse:       SSEManager
  costs:     CostTracker
}): Promise<Response> {
  const { messages, model, sessionId, sse, costs } = opts
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, messages, stream: false })
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = await res.json() as {
      message?: { content: string }
      prompt_eval_count?: number
      eval_count?: number
    }
    const response     = data.message?.content   ?? ''
    const inputTokens  = data.prompt_eval_count  ?? 0
    const outputTokens = data.eval_count         ?? 0

    costs.track({ inputTokens, outputTokens, model, sessionId })
    sse.emit(SSEEventType.AI_DONE, { sessionId, response, inputTokens, outputTokens, ts: Date.now() })
    return Response.json({ ok: true, sessionId, response, inputTokens, outputTokens, provider: 'Ollama' })
  } catch (err) {
    sse.emit(SSEEventType.AI_ERROR, { sessionId, error: String(err), ts: Date.now() })
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
