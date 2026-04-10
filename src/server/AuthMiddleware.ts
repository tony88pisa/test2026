// ============================================================
// MODULO: AuthMiddleware v1.0
// REGOLA: Unico punto di verifica autenticazione nel backend.
//         Supporta 3 modalità: Cookie / Bearer / Query param.
//         Usare authenticate() come guardia su ogni route protetta.
//         VIETATO controllare token fuori da questo modulo.
// DIPENDENZE: BunRouter (M6b)
// DEPRECA: controlli auth inline in server.ts
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import type { RouteHandler } from './BunRouter'

export interface AuthConfig {
  /** Token segreto dal .env — CAMELOT_AUTH_TOKEN */
  token: string
  /** Se true, le route pubbliche bypassano l'auth */
  allowPublicRoutes?: boolean
  /** Lista di pathname che NON richiedono autenticazione */
  publicPaths?: string[]
}

export const DEFAULT_PUBLIC_PATHS = [
  '/api/health',
  '/api/status',
  '/api/events',
  '/api/workspace/events',
]

export class AuthMiddleware {
  private token: string
  private publicPaths: Set<string>

  constructor(config: AuthConfig) {
    this.token = config.token
    this.publicPaths = new Set([
      ...(config.allowPublicRoutes ? DEFAULT_PUBLIC_PATHS : []),
      ...(config.publicPaths ?? [])
    ])
  }

  /**
   * Wrappa un RouteHandler con il controllo auth.
   * Uso: router.get('/api/secret', auth.protect(myHandler))
   */
  protect(handler: RouteHandler): RouteHandler {
    return async (req, params) => {
      const url = new URL(req.url)

      // Bypass per route pubbliche
      if (this.publicPaths.has(url.pathname)) {
        return handler(req, params)
      }

      const extracted = this.extractToken(req)
      if (!extracted || !this.verifyToken(extracted)) {
        return new Response(
          JSON.stringify({ error: 'Non autorizzato', code: 401 }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer realm="Camelot-IDE"'
            }
          }
        )
      }

      return handler(req, params)
    }
  }

  /**
   * Verifica diretta senza wrapping — utile per WebSocket upgrade.
   */
  verify(req: Request): boolean {
    const token = this.extractToken(req)
    return token !== null && this.verifyToken(token)
  }

  private extractToken(req: Request): string | null {
    const url = new URL(req.url)

    // 1. Authorization: Bearer <token>
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7).trim()
    }

    // 2. Cookie 'camelot_token'
    const cookieHeader = req.headers.get('Cookie') ?? ''
    const cookieToken = this.parseCookie(cookieHeader, 'camelot_token')
    if (cookieToken) return cookieToken

    // 3. Query param ?token=<token>
    const queryToken = url.searchParams.get('token')
    if (queryToken) return queryToken

    return null
  }

  private verifyToken(token: string): boolean {
    // Confronto timing-safe (Bun non ha crypto.timingSafeEqual nativo per stringhe, implementazione manuale)
    if (token.length !== this.token.length) return false
    let diff = 0
    for (let i = 0; i < token.length; i++) {
        diff |= token.charCodeAt(i) ^ this.token.charCodeAt(i)
    }
    return diff === 0
  }

  private parseCookie(cookieStr: string, name: string): string | null {
    const match = cookieStr
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${name}=`))
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null
  }
}
