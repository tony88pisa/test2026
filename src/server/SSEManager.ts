// ============================================================
// MODULO: SSEManager v1.1 — aggiornato per M15 GitRouter
// AGGIUNTA: SSEEventType.GIT_CHANGED, GIT_COMMITTED, GIT_PUSHED
// ============================================================

export enum SSEEventType {
  // Workspace
  FILE_CREATED        = 'file:created',
  FILE_UPDATED        = 'file:updated',
  FILE_DELETED        = 'file:deleted',
  WORKSPACE_CHANGED   = 'workspace:changed',

  // AI / Agent
  AI_THINKING         = 'ai:thinking',
  AI_TOKEN            = 'ai:token',
  AI_DONE             = 'ai:done',
  AI_ERROR            = 'ai:error',

  // Buddy / Shizuku
  BUDDY_MESSAGE       = 'buddy:message',
  BUDDY_EMOTION       = 'buddy:emotion',
  BUDDY_STATE_CHANGED = 'buddy:state',

  // Skills
  SKILL_LOADED        = 'skill:loaded',
  SKILL_REMOVED       = 'skill:removed',

  // Terminal
  TERMINAL_OUTPUT     = 'terminal:output',
  TERMINAL_CLOSED     = 'terminal:closed',

  // Git — M15
  GIT_CHANGED         = 'git:changed',
  GIT_COMMITTED       = 'git:committed',
  GIT_PUSHED          = 'git:pushed',

  // Server
  SERVER_READY        = 'server:ready',
  REMOTE_URL          = 'remote:url',
  BUDDY_STATE         = 'buddy:state',
}

interface SSEClient {
  id:         string
  controller: ReadableStreamDefaultController
  createdAt:  number
}

export class SSEManager {
  private static instance: SSEManager
  private clients = new Map<string, SSEClient>()

  private constructor() {
    // Heartbeat ogni 30 secondi per mantenere aperti i tunnel (Cloudflare Mobile Fix)
    setInterval(() => {
      this.emit('heartbeat' as any, { ts: Date.now() })
    }, 30000)
  }

  static getInstance(): SSEManager {
    if (!SSEManager.instance) SSEManager.instance = new SSEManager()
    return SSEManager.instance
  }

  createResponse(): Response {
    const clientId = crypto.randomUUID()
    let controller: ReadableStreamDefaultController
    let heartbeat: any

    const stream = new ReadableStream({
      start: (ctrl) => {
        controller = ctrl
        this.clients.set(clientId, {
          id: clientId,
          controller,
          createdAt: Date.now()
        })

        // Ping iniziale
        ctrl.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify({ type: 'connected', clientId, ts: Date.now() })}\n\n`
        ))

        // Heartbeat ogni 15 secondi per mantenere la connessione (M18.2 Fix)
        heartbeat = setInterval(() => {
          try {
            ctrl.enqueue(new TextEncoder().encode(': ping\n\n'))
          } catch {
            clearInterval(heartbeat)
          }
        }, 15000)
      },
      cancel: () => {
        if (heartbeat) clearInterval(heartbeat)
        this.clients.delete(clientId)
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Client-Id':   clientId,
      }
    })
  }

  emit(type: SSEEventType, data: Record<string, unknown>): void {
    const payload = new TextEncoder().encode(
      `data: ${JSON.stringify({ type, ...data })}\n\n`
    )
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(payload)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  getClientCount(): number {
    return this.clients.size
  }

  destroy(): void {
    for (const client of this.clients.values()) {
      try { client.controller.close() } catch { /* già chiuso */ }
    }
    this.clients.clear()
  }
}
