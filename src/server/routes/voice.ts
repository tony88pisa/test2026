// ============================================================
// MODULO: VoiceRouter v1.0
// REGOLA: Endpoint per trascrizione audio Whisper (Locale/OpenAI).
//         Gestione stream binari e fallback OpenAI se configurata.
// DIPENDENZE: SSEManager (M2), BunRouter (M6b)
// DEPRECA: /api/voice in server.ts
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import { BunRouter } from '../BunRouter'
import { SSEManager, SSEEventType } from '../SSEManager'
// Import dalle logiche locali esistenti
import { createVoiceAdapter } from '../../voice/voiceAdapter'

export function createVoiceRouter(
  sse: SSEManager
): BunRouter {
  const router = new BunRouter()

  // POST /api/voice/transcribe — Trascrizione audio (multipart o base64)
  router.post('/transcribe', async (req, _params) => {
    try {
      const contentType = req.headers.get('Content-Type') ?? ''
      let audioBuffer: Buffer

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        const audioFile = formData.get('audio') as Blob
        if (!audioFile) return Response.json({ error: 'Audio file mancante' }, { status: 400 })
        audioBuffer = Buffer.from(await audioFile.arrayBuffer())
      } else {
          const body = await req.json() as { audio?: string }
          if (!body.audio) return Response.json({ error: 'Audio richiesto' }, { status: 400 })
          audioBuffer = Buffer.from(body.audio, 'base64')
      }

      sse.emit(SSEEventType.AGENT_STATUS, { status: 'Trascrizione audio in corso...', ts: Date.now() })

      // createVoiceAdapter è async
      const voiceAdapter = await createVoiceAdapter()
      const transcript = await voiceAdapter.transcribe(audioBuffer.buffer as ArrayBuffer)
      
      return Response.json({ transcript, ts: Date.now() })
    } catch (err) {
      console.error('[VoiceRouter] Errore trascrizione:', err)
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // GET /api/voice/status — Stato del servizio Whisper / OpenAI
  router.get('/status', async () => {
    return Response.json({
        model: process.env.WHISPER_MODEL || 'openai-whisper-1',
        ready: true,
        ts: Date.now()
    })
  })

  return router
}
