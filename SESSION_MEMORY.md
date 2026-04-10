## Fase Attuale
## [1.8.0] - 2026-04-09
### PROMPT 18 — Agent Loop
- agentLoop.ts: MAX_TURNS=5, JSON tool_calls, SuperMemory trace
- toolRegistry.ts: 8 tool registrati
- projectTools.ts + sysTools.ts: filesystem + whitelist comandi
- /api/agent POST con auth
- Buddy chat: persistente, collegata a /api/agent
- /api/status: agent:true, tools:8
- Tot test: 136

## [1.7.0] - 2026-04-09
**SKICAMELOT_LOCAL = 1
SUPERMEMORY_ACTIVE = 1
COORDINATOR_MODE_COMPLETE = 1
REMOTE_BYPASS_COMPLETE = true
BUDDY_COMPLETE = true
SKILLS_COMPLETE = true
════════════════════════════════
STATUS: 118/118 TEST GREEN ✅
════════════════════════════════
VOICE_ADAPTER    = WhisperAdapter (WHISPER_URL) | stub
VOICE_ENDPOINT   = /api/voice/transcribe
VOICE_FRONTEND   = Web Speech API (Chrome/Edge)
WHISPER_READY    = true (richiede WHISPER_URL)
PROMPTS_COMPLETE = 1→15 ✅ CAMELOT COMPLETE
════════════════════════════════
Ollama: http://localhost:11434
Gemma4: Function Calling + Thinking enabled
Dashboard: http://localhost:3001
Skills API: /api/skills
**DASHBOARD_COMPLETE** = true
Mobile ready: true
Tunnel script: bun run tunnel
URL locale: http://localhost:3001
Context Window: 128K ([removed: out of scope] ready)
- Skills: 5 skill prioritarie implementate e barrel-exported.
- REPL Integration: Comandi `!` attivi in `index.ts`.
- Security: Auth Bearer + Rate Limit attivo.
- Voice: Keyword-to-skill mapping attivo.
- Skillify: Wrapper attivo con logging su `data/memory.json.log`.
- Recovery: `index.ts` ripristinato e ripulito dopo errore di patching.

## Prossimi Passi (NextStep)
1. Implementa le restanti 12 skill bundled.
2. Aggiungi supporto per parametri complessi nelle skill via parsing avanzato.
