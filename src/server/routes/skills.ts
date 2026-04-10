// ============================================================
// MODULO: SkillsRouter v1.2 — M17 SkillLoader Integration
// REGOLA: Gestisce caricamento, lista ed esecuzione delle skill.
//         Usa lo SkillLoader (M17) per la gestione dei moduli.
// DIPENDENZE: SkillLoader (M17), SSEManager (M2), BunRouter (M6b)
// ENDPOINT:
//   GET  /api/skills/list     — Tutte le skill disponibili
//   GET  /api/skills/loaded   — Skill attualmente in memoria
//   POST /api/skills/:name/load
//   POST /api/skills/:name/unload
//   POST /api/skills/:name/execute
// ============================================================

import { BunRouter } from '../BunRouter'
import { SSEManager } from '../SSEManager'
import { WorkspaceManager } from '../WorkspaceManager'
import { SkillLoader } from '../../skills/SkillLoader'

export function createSkillsRouter(
  workspace: WorkspaceManager,
  sse: SSEManager
): BunRouter {
  const router = new BunRouter()
  
  // Inizializza il Loader (Singleton)
  const loader = SkillLoader.getInstance(
    workspace.resolvePath('src/skills/bundled'),
    sse
  )

  // Autoload iniziale delle skill segnate nel manifest
  loader.autoload().catch(err => console.error('[SkillsRouter] Autoload failed:', err))

  // GET /api/skills/list — Tutte le skill (scaricate e non)
  router.get('/list', async () => {
    const available = loader.scanAvailable()
    return Response.json({
      skills: available.map(s => ({
        ...s.manifest,
        loaded: s.loaded,
        path: s.dirPath
      })),
      count: available.length
    })
  })

  // GET /api/skills/loaded — Solo le skill in memoria con statistiche
  router.get('/loaded', async () => {
    return Response.json({
      loaded: loader.getStats(),
      count: loader.getLoaded().length
    })
  })

  // GET /api/skills — Compatibilità v1.0 (alias di /list)
  router.get('/', async () => {
    const available = loader.scanAvailable()
    return Response.json(available.map(s => s.manifest))
  })

  // POST /api/skills/:name/load
  router.post('/:name/load', async (_req, params) => {
    const { name } = params
    try {
      const loaded = await loader.load(name)
      return Response.json({ ok: true, skill: loaded.manifest })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // POST /api/skills/:name/unload
  router.post('/:name/unload', async (_req, params) => {
    const { name } = params
    try {
      loader.unload(name)
      return Response.json({ ok: true, unloaded: name })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 404 })
    }
  })

  // POST /api/skills/:name/execute
  router.post('/:name/execute', async (req, params) => {
    const { name } = params
    try {
      const { command, args = [] } = await req.json() as { command: string; args?: unknown[] }
      const result = await loader.execute(name, command, args)
      return Response.json({ ok: true, result })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  return router
}
