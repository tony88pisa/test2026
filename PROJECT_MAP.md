# Mappa del Progetto Camelot-IDE

> Source repo: tony88pisa/project-camelot-utils (branch: main)
> Mappatura aggiornata: 2026-04-08

---

## 🔑 File Critici per il Progetto Camelot-IDE

### Core DI — Punto di Injection

| File | Percorso | Funzione |
|------|----------|----------|
| **deps.ts** | `query/deps.ts` | **INTERFACCIA DI** — Definisce `QueryDeps { callModel, microcompact, autocompact, uuid }`. `productionDeps()` restituisce le implementazioni Anthropic. **Questo è il punto dove inseriremo `localDeps()`.** |
| **query.ts** | `query.ts` | **MAIN LOOP AGENTICO** — Alla riga 269: `const deps = params.deps ?? productionDeps()`. Usa `deps.callModel()` alla riga 668 per chiamare il modello. ~1750 righe, NON va modificato. |
| **QueryEngine.ts** | `QueryEngine.ts` | **Orchestratore sessione** — Classe `QueryEngine` che possiede il lifecycle della conversazione. Chiama `query()` alla riga 683 passando `QueryParams`. `ask()` è il wrapper convenience per uso one-shot. |
| **config.ts** | `query/config.ts` | **Feature flags** — `buildQueryConfig()` snapshot di gate/statsig/session state. Non va modificato per Ollama. |

### API Layer — Da Capire per l'Adapter

| File | Percorso | Funzione |
|------|----------|----------|
| **claude.ts** | `services/api/claude.ts` | **queryModelWithStreaming** — La funzione che `callModel` punta. Bridge verso l'API Anthropic. DA LEGGERE per capire la signature esatta (input/output types). |
| **errors.ts** | `services/api/errors.ts` | **Error handling API** — `categorizeRetryableAPIError()`, `PROMPT_TOO_LONG_ERROR_MESSAGE`. Pattern da seguire per ollama-errors.ts. |

### Query Flow — Come Scorre una Richiesta

| File | Percorso | Funzione |
|------|----------|----------|
| **stopHooks.ts** | `query/stopHooks.ts` | **Post-risposta hooks** — `handleStopHooks()` eseguito dopo ogni risposta del modello. |
| **tokenBudget.ts** | `query/tokenBudget.ts` | **Budget token** — `createBudgetTracker()`, `checkTokenBudget()`. |
| **transitions.ts** | (non nel repo direttamente) | **State machine** — Tipi `Terminal` e `Continue` per il loop di query. |

### Struttura Directory Principale

```
/
├── QueryEngine.ts          # Orchestratore sessione (classe)
├── query.ts                # Main loop agentico (funzione query())
├── query/
│   ├── deps.ts             # 🎯 INTERFACCIA DI — punto di injection
│   ├── config.ts           # Feature flags snapshot
│   ├── stopHooks.ts        # Post-risposta hooks
│   └── tokenBudget.ts      # Budget token tracking
├── Tool.ts                 # Definizione tools (Tools, ToolUseContext)
├── Task.ts                 # Task management
├── commands.ts             # Slash commands registry
├── commands/               # Implementazioni comandi (/compact, /model, ecc.)
├── components/             # UI React/Ink (~200 file)
├── bridge/                 # Bridge desktop↔CLI
├── buddy/                  # Companion sprite UI
├── cli/                    # CLI transport/IO layer
├── services/
│   ├── api/
│   │   ├── claude.ts       # queryModelWithStreaming (target per adapter)
│   │   └── errors.ts       # Error handling API
│   ├── compact/            # Auto-compaction context
│   ├── mcp/                # MCP protocol
│   └── ...
├── utils/                  # Utilities (~100 file)
├── assistant/              # Session history
├── bootstrap/              # State bootstrap
├── package.json            # Dipendenze (axios, p-retry, p-timeout, ecc.)
├── tsconfig.json           # ESNext target, bundler resolution
└── .gitignore
```

---

## 📐 Architettura da Creare (File Nuovi)

| File | Percorso Pianificato | Funzione |
|------|---------------------|----------|
| **localDeps.ts** | `query/localDeps.ts` | Factory `localDeps()` che fa spread di `productionDeps()` e override solo `callModel` con `ollamaCallModel` |
| **ollama-adapter.ts** | `src/adapters/ollama-adapter.ts` | Bridge Anthropic tool_use → OpenAI function_call format. Usa axios + eventsource-parser per SSE |
| **ollama-errors.ts** | `src/adapters/ollama-errors.ts` | Error types specializzati per Ollama/Gemma + retry logic con p-retry |
| **localMemoryStore.ts** | `src/memory/localMemoryStore.ts` | Persistenza memoria su disco locale |
| **agentBindings.ts** | `src/vim/agentBindings.ts` | Collegamento vim engine ↔ agente |
| **index.ts** | `src/index.ts` | Entry point principale Camelot-IDE |
| **tests/** | `src/tests/` | Test suite |

---

## 🔗 Dipendenze Critiche tra File

```
QueryEngine.ts
  └─→ query.ts (chiama query() con QueryParams)
        └─→ query/deps.ts (const deps = params.deps ?? productionDeps())
              └─→ deps.callModel = queryModelWithStreaming  ← QUESTO VA SOSTITUITO
              └─→ deps.microcompact = microcompactMessages  ← resta
              └─→ deps.autocompact = autoCompactIfNeeded    ← resta
              └─→ deps.uuid = randomUUID                   ← resta
```

**Flusso per Camelot-IDE:**
```
QueryEngine.ts
  └─→ query.ts (chiama query() con { deps: localDeps() })
        └─→ query/localDeps.ts
              └─→ deps.callModel = ollamaCallModel  ← NUOVO (src/adapters/ollama-adapter.ts)
              └─→ deps.microcompact = microcompactMessages  ← invariato
              └─→ deps.autocompact = autoCompactIfNeeded    ← invariato
              └─→ deps.uuid = randomUUID                   ← invariato
```
