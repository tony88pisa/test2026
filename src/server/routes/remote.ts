// ============================================================
// MODULO: RemoteRouter v1.0 — Modulo M19
// ============================================================

import { BunRouter } from '../BunRouter'
import { AuthMiddleware } from '../AuthMiddleware'
import { RemoteManager } from '../../remote/RemoteManager'

export function createRemoteRouter(auth: AuthMiddleware): BunRouter {
  const router = new BunRouter()
  const remote = RemoteManager.getInstance()

  /**
   * GET /api/remote/status
   * Restituisce lo stato dell'accesso remoto.
   */
  router.get('/status', auth.protect(async () => {
    const url = remote.getPublicUrl()
    return Response.json({
      active: !!url,
      url: url,
      mode: url ? 'cloudflare' : 'offline',
      ts: Date.now()
    })
  }))

  return router
}
