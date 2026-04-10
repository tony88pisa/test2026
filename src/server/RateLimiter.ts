// ============================================================
// MODULO: RateLimiter v1.0
// REGOLA: Controllo per-IP delle richieste al backend.
//         Auto-block degli IP che superano la soglia.
//         Mantiene una finestra scorrevole in memoria.
// DIPENDENZE: nessuna (modulo base)
// DEPRECA: rate limit inline in server.ts
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  autoBlock?: boolean
  blockDurationMs?: number
}

interface RateLimitEntry {
  requests: number[]
  blockedUntil?: number
}

export class RateLimiter {
  private static instance: RateLimiter
  private limits: Map<string, RateLimitEntry> = new Map()
  private cleanupTimer: Timer

  constructor(private config: RateLimitConfig) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000)
  }

  static getIP(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]
        ?? req.headers.get('cf-connecting-ip')
        ?? '127.0.0.1'
  }

  check(ip: string): { allowed: boolean; remaining: number; reset: number } {
    const now = Date.now()
    let entry = this.limits.get(ip)

    if (!entry) {
      entry = { requests: [] }
      this.limits.set(ip, entry)
    }

    // Verifica blocco
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return { allowed: false, remaining: 0, reset: entry.blockedUntil }
    }

    // Pulisci finestra
    entry.requests = entry.requests.filter(ts => now - ts < this.config.windowMs)

    if (entry.requests.length >= this.config.maxRequests) {
      if (this.config.autoBlock) {
        entry.blockedUntil = now + (this.config.blockDurationMs ?? 60_000)
      }
      return { allowed: false, remaining: 0, reset: now + this.config.windowMs }
    }

    entry.requests.push(now)
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.requests.length,
      reset: now + this.config.windowMs
    }
  }

  tooManyResponse(result: { reset: number }): Response {
    return new Response(
      JSON.stringify({ error: 'Too Many Requests', retryAfter: result.reset }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString()
        }
      }
    )
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [ip, entry] of this.limits) {
      if (entry.blockedUntil && entry.blockedUntil < now) {
        delete entry.blockedUntil
      }
      if (entry.requests.length === 0 && !entry.blockedUntil) {
        this.limits.delete(ip)
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
    this.limits.clear()
  }
}
