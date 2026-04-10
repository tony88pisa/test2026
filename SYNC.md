# SYNC.md — Registro Moduli Camelot-IDE v2.7

> **REGOLA**: Aggiornare questo file dopo ogni modulo completato.
> Non rimuovere mai le righe DEPRECA — servono per il diff storico.

## Moduli Completati ✅

| # | Modulo | File | Stato | Depreca | Completato |
|---|--------|------|-------|---------|------------|
| 1 | WorkspaceManager | `src/server/WorkspaceManager.ts` | ✅ | accessi `fs` diretti sparsi | 2026-04-09 |
| 2 | SSEManager | `src/server/SSEManager.ts` | ✅ | SSE inline | 2026-04-09 |
| 3 | WorkspaceRoutes | `src/server/routes/workspace.ts` | ✅ | — | 2026-04-09 |
| 4 | EmberWorkspaceContext | `src/buddy/workspaceContext.ts` | ✅ | prompt generico | 2026-04-09 |
| 4b | BuddyPrompt | `src/buddy/prompt.ts` | ✅ | prompt hardcoded | 2026-04-09 |
| 5 | CostTracker | `src/server/CostTracker.ts` | ✅ | — | 2026-04-09 |
| 6b | BunRouter | `src/server/BunRouter.ts` | ✅ | Express | 2026-04-09 |
| 7 | AuthMiddleware | `src/server/AuthMiddleware.ts` | ✅ | auth inline server.ts | 2026-04-09 |
| 8 | RateLimiter | `src/server/RateLimiter.ts` | ✅ | mappa IP inline | 2026-04-09 |
| 9 | ServerIndex v2.6 | `src/server/index.ts` | ✅ | src/dashboard/server.ts ✂️ | 2026-04-10 |
| 10 | AgentRouter | `src/server/routes/agent.ts` | ✅ | /api/agent in server.ts | 2026-04-09 |
| 10b | OpenRouter M10b | `src/server/routes/agent.ts` | ✅ | Gemma4-only hardcoded | 2026-04-09 |
| 11 | BuddyRouter | `src/server/routes/buddy.ts` | ✅ | /api/buddy in server.ts | 2026-04-09 |
| 12 | SkillsRouter | `src/server/routes/skills.ts` | ✅ | /api/skills in server.ts | 2026-04-09 |
| 13 | VoiceRouter | `src/server/routes/voice.ts` | ✅ | /api/voice in server.ts | 2026-04-09 |
| 14 | Launcher v2.5 | `src/launcher.ts` | ✅ | path: dashboard → server | 2026-04-09 |
| 15 | GitRouter | `src/server/routes/git.ts` | ✅ | git inline in server.ts | 2026-04-10 |
| 16 | SkillLoader | `src/skills/SkillLoader.ts` | ✅ | import() sparsi | 2026-04-10 |
| 16a | Skill: remember | `src/skills/bundled/remember/` | ✅ | — | 2026-04-10 |
| 16b | Skill: codeSearch | `src/skills/bundled/codeSearch/` | ✅ | — | 2026-04-10 |
| 17 | Dashboard UI | `src/dashboard/` | ✅ | — | 2026-04-10 |
| 19 | RemoteManager | `src/remote/RemoteManager.ts` | ✅ | — | 2026-04-10 |
| 20 | BuddyStateManager | `src/buddy/BuddyStateManager.ts` | ✅ | — | 2026-04-10 |
| 21 | Monaco Editor | `src/dashboard/app.js` | ✅ | — | 2026-04-10 |

## Prossimi Moduli

| # | Modulo | File | Descrizione | Priorità |
|---|--------|------|-------------|----------|
| 18 | PluginManager | `src/plugins/PluginManager.ts` | Plugin hot-reload | 🟠 Media |

## Checklist Operativa

- [x] `bun run src/server/index.ts` — server avvia senza errori
- [x] `curl http://localhost:3001/api/git/status`
- [x] `curl http://localhost:3001/api/agent/provider`
- [x] `curl http://localhost:3001/api/buddy/status`
- [x] **ELIMINATO** `src/dashboard/server.ts` ✂️
- [x] Dashboard UI operativa
- [x] Test WebSocket terminale con xterm.js
- [x] RemoteManager attivo (cloudflared generato)
- [x] BuddyStateManager attivo (Ollama polling + Moods)

## Regole Assolute

### Skills
> **VIETATO** `import()` di skill fuori da `SkillLoader`.
> Ogni skill DEVE avere `manifest.json` con `commands[]`.
> Autoload: aggiungi `"autoload": true` nel manifest.

### Git
> **VIETATO** `Bun.spawn(['git', ...])` fuori da `GitRouter`.

### AI / Provider
> **VIETATO** chiamare `openrouter.ai` o `localhost:11434` fuori da `AgentRouter`.

### SSE
> **VIETATO** `controller.enqueue()` fuori da `SSEManager`.

### Auth
> **VIETATO** controllare `CAMELOT_AUTH_TOKEN` fuori da `AuthMiddleware`.

### Filesystem
> **VIETATO** `fs.readFileSync/writeFileSync` fuori da `WorkspaceManager`.

## Note Architetturali v2.6

- **Skill System**: `SkillLoader` singleton + autoload da manifest
- **Skill bundled**: `remember` (memoria persistente) + `codeSearch` (ripgrep/findstr)
- **Runtime**: `Bun.serve()` nativo
- **AI Provider**: Ollama (Gemma 3) PRIMARY → fallback OpenRouter (Cloud)
- **Git**: 11 endpoint via `GitRouter` + `Bun.spawn`
- **Remote**: Cloudflare Tunnel (Quick Tunnel) → URL pubblico dinamico
- **PWA**: Dashboard installabile con Service Worker (Network-First)
- **Code Editor**: Monaco Editor (v2.7) — Edit & Save (Ctrl+S)
