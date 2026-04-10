# Changelog
Tutte le modifiche salienti al progetto Camelot-IDE.

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
### PROMPT 17 — Web Research
- browserAdapter.ts: Playwright headless DuckDuckGo
- searchCache.ts: persistent cache TTL 24h
- skills/builtin/searchWeb.ts: /search-web + /read-page
- SuperMemory: persistenza automatica ricerche
- Dashboard: barra di ricerca Home tab
- Tot test: 124

[2026-04-08] [SESSION_MEMORY.md] — Creato file memoria sessione — Setup iniziale progetto — Nessuna alternativa (primo file)
[2026-04-08] [CHANGELOG.md] — Creato file changelog — Tracciare ogni modifica — Nessuna alternativa
[2026-04-08] [DECISIONS.md] — Creato file decision log — Documentare scelte architetturali — Nessuna alternativa
[2026-04-08] [PROJECT_MAP.md] — Creato file mappa progetto — Mappare struttura repository — Nessuna alternativa
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #2 — Wrapper strategy per queryModelWithStreaming: accettare stessa firma, ignorare params Anthropic-specifici — Alternativa scartata: reimplementare tutto il layer Options
[2026-04-08] [src/adapters/ollama-message-converter.ts] — Creato modulo conversione messaggi Anthropic↔OpenAI — Isolato dall'adapter per testabilità — Alternativa: inline nell'adapter (meno testabile)
[2026-04-08] [src/adapters/ollama-adapter.ts] — Creato adapter principale Ollama — Drop-in per queryModelWithStreaming via axios+SSE+p-retry+p-timeout — Alternativa: fetch nativo (meno error handling)
[2026-04-08] [src/adapters/ollama-adapter.ts] — Fix tipo Options: PartialOptions → Options reale da claude.ts — Necessario per compatibilità typeof queryModelWithStreaming
[2026-04-08] [query/localDeps.ts] — Creato DI factory localDeps() — Override solo callModel con ollamaCallModel — Alternativa: spread productionDeps (fragile se upstream aggiunge deps)
[2026-04-08] [scripts/test-ollama.ts] — Creato smoke test standalone — Testa ollamaCallModel direttamente senza bootstrap completo — Alternativa: test via query() (richiede troppo setup)
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #3 — localDeps esplicita con 4 campi, override solo callModel — Alternativa: spread productionDeps (rischia fork drift)
[2026-04-08] [src/adapters/ollama-errors.ts] — Creato modulo error handling specializzato — Classifica errori Ollama (ECONNREFUSED, 404, OOM, timeout, context length) — Alternativa: error handling generico (perde contesto actionable)
[2026-04-08] [src/adapters/ollama-adapter.ts] — Rimosso p-retry, integrato ollama-errors, timeout 90s — Mai throw, sempre yield SystemAPIErrorMessage — Alternativa: retry con backoff (inutile su localhost)
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #4 — No retry per Ollama locale, errori yield mai throw — Alternativa: backoff esponenziale (aggiunge latenza senza benefici)
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #5 — Non reimplementare SessionMemory, abilitare esistente via env var — Alternativa: localMemoryStore.ts da zero (duplicazione + conflitti runForkedAgent)
[2026-04-08] [SESSION_MEMORY.md] — Documentate 5 scoperte critiche da sessionMemory.ts: runForkedAgent eredita deps, gate Growthbook, soglie reali (init=10000, update=5000, toolCalls=3)
[2026-04-08] [src/memory/enableLocalMemory.ts] — Creato modulo attivazione SessionMemory locale — env var gate + soglia init abbassata a 3000 + re-export funzioni utili — Zero dipendenze nuove
[2026-04-08] [services/SessionMemory/sessionMemory.patch.ts] — Documentata modifica 1 riga: isSessionMemoryGateEnabled() con env var override — Da applicare al repo upstream
[2026-04-08] [query/localDeps.ts] — Aggiunto enableLocalMemory() a module load — Hook SessionMemory si registra prima di query()
[2026-04-08] [scripts/test-memory.ts] — Creato smoke test per gate, soglie, path Windows, e reset — Non richiede Ollama running
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #6 — Registry Map per agent bindings, non switch/case — Alternativa: switch/case (non estendibile/testabile)
[2026-04-08] [src/vim/agentBindings.ts] — Creato registry vim bindings con 5 comandi (<leader>ai, fix, explain, ctx, repeat) — buildAgentPrompt puro e testabile — normalizeFilePath per Windows
[2026-04-08] [scripts/test-bindings.ts] — Creato test per registry, prompt builder, executeBinding, repeat con null, normalizeFilePath — Non richiede Ollama
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #7 — Bun test runner nativo con mock AsyncGenerator — Alternativa scartata: vitest (dipendenza extra)
[2026-04-08] [src/__tests__/error-recovery.test.ts] — Test 7 tipi di errore classificati + buildOllamaErrorMessage — Funzioni pure, no mock
[2026-04-08] [src/__tests__/ollama-adapter.test.ts] — Test stream, tool_use, abort, ECONNREFUSED, 404 — Mock axios con SSE sintetico
[2026-04-08] [src/__tests__/memory-store.test.ts] — Test soglie, gate, config, path, reset, waitFor — resetSessionMemoryState in beforeEach
[2026-04-08] [src/__tests__/localDeps.test.ts] — Test DI override, env var, idempotenza, tutti i deps presenti, uuid unico
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #8 — REPL readline nativo come entry point — Alternativa scartata: HTTP server (overhead inutile locale)
[2026-04-08] [src/index.ts] — Creato entry point REPL con 5-step startup (health check, model verify, enableLocalMemory, localDeps, readline loop) — Streaming output, comandi :quit :status :memory :help, SIGINT graceful
[2026-04-08] [README_CAMELOT.md] — Creato README completo con architettura ASCII, tabella moduli, comandi test, indice decisioni, struttura file
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #9 — Continue.dev come frontend VS Code, connessione diretta Ollama — Alternativa scartata: proxy HTTP
[2026-04-08] [.continue/config.json] — Configurazione Continue.dev: 2 modelli Gemma (27B+4B), nomic-embed-text, 7 context providers, 5 slash commands + 1 custom
[2026-04-08] [.continue/prompts/camelot-system.prompt] — System prompt con architettura progetto e 8 regole operative
[2026-04-08] [README_CAMELOT.md] — Aggiunta sezione Continue.dev Integration con installazione, slash commands, shortcuts, embedding, modelli configurati
[2026-04-08] [.gitignore] — Creato con esclusione .continue/index/, .continue/logs/, node_modules, OS files
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #10 — findRelevantMemories usa sideQuery (secondo binding point), non deps.callModel — MVP: lascio unpatched, fallisce silenzioso
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #11 — autoDream disattivato via env var — GrowthBook già default=false, guard extra per sicurezza
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #12 — coordinatorMode è solo config/prompt, non chiama callModel — safe per Ollama, ma disabilitato per MVP (VRAM)
[2026-04-08] [src/patches/disableAutoDream.ts] — Creato guard env var CAMELOT_AUTODREAM=false — defense-in-depth, upstream già disabilitato
[2026-04-08] [src/patches/patchSideQuery.ts] — Documentazione secondo binding point sideQuery() → getAnthropicClient() — MVP unpatched, future: localSideQuery
[2026-04-08] [src/memory/enableLocalMemory.ts] — Aggiunto disableAutoDream() + delete CLAUDE_CODE_COORDINATOR_MODE al startup (Decisioni #11, #12)
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #13 — sideQuery override via globalThis.__ollamaSideQuery — implementazione reale, upstream 3-line patch necessaria
[2026-04-08] [src/patches/patchSideQuery.ts] — Trasformato da documentazione a implementazione reale: ollamaSideQuery() con Ollama /v1/chat/completions, JSON schema via prompt, extractJSON(), registerSideQueryOverride()
[2026-04-08] [src/memory/enableLocalMemory.ts] — Aggiunto registerSideQueryOverride() al startup (step 5, Decisione #13)
[2026-04-08] [utils/sideQuery.ts] — Documentato (patch non applicabile localmente): +3 righe hook globalThis.__ollamaSideQuery per abilitare override Ollama
[2026-04-08] [services/autoDream/config.ts] — Documentato (patch non applicabile localmente): aggiunta riga `if (process.env.CAMELOT_LOCAL === '1') return false` prima del return/export per master switch
[2026-04-08] [services/SessionMemory/sessionMemory.ts] — Documentato (patch non applicabile localmente): Inserimento di `if (process.env.CAMELOT_LOCAL === '1') return` per bypass gate
[2026-04-08] [DECISIONS.md] — Aggiunta Decisione #14 — Variabile env CAMELOT_LOCAL=1 come master switch globale
[2026-04-09] [src/vim/agentBindings.ts] — PROMPT 6 — Vim bindings complete: implementate 32 native core vim actions, fallback AI interceptor e bypass locale.
[2026-04-09] [src/__tests__] — PROMPT 7 — Test suite nativa Bun: creati vim.test.ts, patches.test.ts e ollama.test.ts. Aggiunto script test in package.json.
[2026-04-09] [src/adapters/ollama-adapter.ts] — PROMPT 8 — Blindatura finale: Uniformato wrapper `stream_event` per tutti i delta SSE. 31/31 (ora 41/41) test green.
[2026-04-09] [src/index.ts] — PROMPT 8 — E2E Test: Verificata con successo la risposta di Gemma 4 (latenza ~20s). Creati stub per sbloccare import chain mancanti.
[2026-04-09] [coordinator] — PROMPT 9 — Coordinator Mode attivo: sbloccato sistema multi-agent tramite bypass Statsig feature gates e stub `isCoordinatorMode`.
[2026-04-09] [bridge] — PROMPT 10 — Bridge local bypass: disattivata connessione remota Anthropic e sostituzione con stubs locali forzati.
[2026-04-09] [memory] — PROMPT 11 — Supermemory integration: implementata memoria permanente cross-session con recall al startup e save al shutdown.
[2026-04-09] [hooks/proxy] — PROMPT 12 — upstreamproxy stub + useMoreRight: integrato hook di intercettazione query/risposte con persistenza automatica su Supermemory.
[2026-04-09] [coordinator] — PROMPT 8 — Local Coordinator Mode: Rebranding "Camelot", worker limit configurable (default 3), e suite di test coordinator.test.ts e agent.test.ts (76/76 green).
[2026-04-09] [remote] — PROMPT 9 — Remote bypass + Ollama routing: creato src/remote/localBridge.ts e patchato upstreamproxy/relay.ts per routing HTTP locale (83/83 green).
[2026-04-09] [buddy] — PROMPT 10 — Buddy Companion dashboard: creato src/buddy/localCompanion.ts, integrati endpoint /api/buddy nel server dashboard e aggiunto widget HTML (87/87 green).
[2026-04-09] [skills] — PROMPT 11 — Skills MCP + Gemma4 Native: upgrade localBridge (function calling + thinking), creato framework src/skills/ e 4 builtin skills con pannello UI (93/93 green). [removed: out of scope]
[2026-04-09] [memory] — PROMPT 12 — Cleanup + SuperMemory Persistente: rimosse skill trading, implementato src/memory/sessionContext.ts con fallback locale e summarizeSession (95/95 green).
[2026-04-09] [dashboard] — PROMPT 13 — Dashboard mobile + tunnel: HTML responsive mobile-first (4 tab), /api/status con health check Ollama, /api/memory/sessions e script tunnel cloudflared (102/102 green).
[2026-04-09] [security] — PROMPT 14 — Auth + Security + Voice prep: Bearer token auth, Rate limiting (60 req/min), Security headers (CSP), voiceAdapter stub, /api/voice/status (110/110 green).
[2026-04-09] [voice] — PROMPT 15 — Whisper Voice Control: WhisperAdapter via Ollama, keyword mapping (\b regex), Dashboard mic UI (Web Speech API) e auth token input (118/118 green).




