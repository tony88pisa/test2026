// ============================================================
// MODULO: WorkspaceRoutes v1.0
// REGOLA: Tutti gli endpoint /api/workspace passano qui.
//         Usa WorkspaceManager per FS e SSEManager per eventi.
// DIPENDENZE: WorkspaceManager (M1), SSEManager (M2), BunRouter (M6b)
// DEPRECA: nessuno (nuovo)
// SYNC: registrare in server/index.ts dopo creazione
// ============================================================

import { BunRouter } from '../BunRouter'
import { WorkspaceManager } from '../WorkspaceManager'
import { SSEManager, SSEEventType } from '../SSEManager'

export function createWorkspaceRouter(
  workspace: WorkspaceManager,
  sse: SSEManager
): BunRouter {
  const router = new BunRouter()

  // GET /api/workspace/tree
  router.get('/tree', async (_req, _params) => {
    const tree = workspace.getTree()
    return Response.json({ tree, root: workspace.getRootPath() })
  })

  // GET /api/workspace/file?path=src/main.ts
  router.get('/file', async (req, _params) => {
    const url = new URL(req.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      return Response.json({ error: 'Parametro "path" mancante' }, { status: 400 })
    }
    try {
      const content = workspace.getFile(filePath)
      return Response.json({ content, path: filePath })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 404 })
    }
  })

  // POST /api/workspace/file  { path: string, content: string }
  router.post('/file', async (req, _params) => {
    try {
      const { path: filePath, content } = await req.json() as { path: string; content: string }
      if (!filePath || content === undefined) {
        return Response.json({ error: '"path" e "content" richiesti' }, { status: 400 })
      }
      workspace.writeFile(filePath, content)
      sse.emit(SSEEventType.WORKSPACE_FILE_CHANGED, { path: filePath, type: 'change', ts: Date.now() })
      sse.emit(SSEEventType.WORKSPACE_TREE_CHANGED, { tree: workspace.getTree(), ts: Date.now() })
      return Response.json({ ok: true })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // DELETE /api/workspace/file?path=...
  router.delete('/file', async (req, _params) => {
    const url = new URL(req.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      return Response.json({ error: 'Parametro "path" mancante' }, { status: 400 })
    }
    try {
      workspace.deleteFile(filePath)
      sse.emit(SSEEventType.WORKSPACE_FILE_CHANGED, { path: filePath, type: 'remove', ts: Date.now() })
      sse.emit(SSEEventType.WORKSPACE_TREE_CHANGED, { tree: workspace.getTree(), ts: Date.now() })
      return Response.json({ ok: true })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // GET /api/workspace/events — SSE stream aggiornamenti workspace
  router.get('/events', async (_req, _params) => {
    const response = sse.createResponse()
    // Invia tree iniziale al nuovo client
    sse.emit(SSEEventType.WORKSPACE_TREE_CHANGED, {
      tree: workspace.getTree(),
      ts: Date.now()
    })
    return response
  })

  // Propaga cambiamenti filesystem via SSE in tempo reale
  workspace.onChanged(event => {
    sse.emit(SSEEventType.WORKSPACE_FILE_CHANGED, { ...event })
    sse.emit(SSEEventType.WORKSPACE_TREE_CHANGED, {
      tree: workspace.getTree(),
      ts: Date.now()
    })
  })

  return router
}
