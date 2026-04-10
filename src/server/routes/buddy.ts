// ============================================================
// MODULO: BuddyRouter v1.0
// REGOLA: Endpoint per chat Shizuku, emozioni e status companion.
//         Usa SSEManager per lo streaming dei token Buddy.
// DIPENDENZE: SSEManager (M2), CostTracker (M5), BunRouter (M6b)
// DEPRECA: /api/buddy in server.ts
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import { BunRouter } from '../BunRouter'
import { SSEManager, SSEEventType } from '../SSEManager'
import { CostTracker } from '../CostTracker'
import { BuddyStateManager } from '../../buddy/BuddyStateManager'
// Import dalle logiche locali esistenti
import { buildLocalCompanion, companionUserId } from '../../buddy/localCompanion'

export function createBuddyRouter(
  sse: SSEManager,
  costs: CostTracker
): BunRouter {
  const router = new BunRouter()

  // GET /api/buddy — Stato e configurazione completa
  router.get('/', async () => {
    try {
      const buddy = await buildLocalCompanion(companionUserId())
      return Response.json(buddy)
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // POST /api/buddy/chat — Chat interattiva Shizuku/Ember
  router.post('/chat', async (req, _params) => {
    try {
      const body = await req.json() as { message: string }
      const userMsg = body.message || ''
      if (!userMsg) return Response.json({ error: 'Messaggio richiesto' }, { status: 400 })

      const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
      const MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:latest';
      const SYSTEM = `Sei Shizuku, un'assistente AI femminile italiana, intelligente, leggermente ironica e affettuosa. Rispondi in italiano, in modo conciso (max 3 frasi). Puoi aiutare con codice Python, trading bot e domande generali. Sei curiosa e ti piace scherzare.`;

      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userMsg }
          ],
          stream: false
        })
      });

      const ollamaData = await ollamaRes.json() as any;
      const reply = ollamaData.message?.content || 'Non ho capito, scusa!';

      sse.emit(SSEEventType.BUDDY_MESSAGE, { reply, ts: Date.now() })
      costs.track({ 
        inputTokens: 0, 
        outputTokens: 20, 
        model: MODEL, 
        sessionId: 'shizuku-chat' 
      }) 

      return Response.json({ reply })
    } catch (err) {
      console.error('[BuddyRouter] Errore:', err)
      return Response.json({ error: String(err), reply: 'Scusa, qualcosa è andato storto...' }, { status: 500 })
    }
  })

  // GET /api/buddy/status — Alias per compatibilità
  router.get('/status', async () => {
    return Response.json({
      name: 'Shizuku',
      role: 'Companion AI',
      ts: Date.now()
    })
  })

  // GET /api/buddy/state — STATO CENTRALE (M20)
  router.get('/state', async () => {
    return Response.json(BuddyStateManager.getInstance().getState())
  })

  return router
}
