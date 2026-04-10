# 🏰 Camelot-IDE

IDE agentico locale con **Gemma 3** + **Vim engine** + **memoria persistente**.  
Tutto gira in locale su Ollama — nessun dato esce dalla tua macchina.

---

## Requisiti

| Componente | Versione minima | Note |
|------------|-----------------|------|
| [Bun](https://bun.sh) | ≥ 1.1.0 | Runtime JavaScript/TypeScript |
| [Ollama](https://ollama.com) | ≥ 0.3.0 | Inference locale per LLM |
| GPU VRAM | ≥ 12GB | Per `gemma3:27b` (raccomandato) |
| GPU VRAM | ≥ 6GB | Per `gemma3:4b` (alternativa leggera) |

---

## Installazione

```bash
# Clona il repository
git clone https://github.com/tony88pisa/project-camelot-utils
cd project-camelot-utils
bun install

# Scarica il modello
ollama pull gemma3:27b        # RTX 5080/4090 (≥12GB VRAM)
# oppure
ollama pull gemma3:4b          # GPU con meno VRAM (≥6GB)
```

---

## Avvio

```bash
# Terminale 1 — avvia Ollama
ollama serve

# Terminale 2 — avvia Camelot-IDE
bun run src/index.ts
```

### Variabili d'ambiente (opzionali)

```bash
OLLAMA_BASE_URL=http://localhost:11434   # Default
OLLAMA_MODEL=gemma3:27b                  # Default  
OLLAMA_TIMEOUT_MS=90000                  # Timeout in ms (default 90s)
CAMELOT_SESSION_MEMORY=true              # Abilitato automaticamente
```

---

## Comandi REPL

| Comando | Descrizione |
|---------|-------------|
| `:help` | Mostra lista comandi |
| `:status` | Stato sistema (Ollama, modello, memoria, uptime) |
| `:memory` | Contenuto della session memory corrente |
| `:quit` / `:exit` | Salva memoria e termina |
| *testo libero* | Query inviata a Gemma locale |

---

## Architettura

```
┌─────────────────────────────────────────────────────────┐
│                    src/index.ts (REPL)                   │
│  readline loop → query → stream → stdout                │
├─────────────────────────────────────────────────────────┤
│              query/localDeps.ts (DI Factory)             │
│  callModel: ollamaCallModel │ micro/autocompact │ uuid  │
├─────────────┬───────────────┬───────────────────────────┤
│  Adapters   │    Memory     │       Vim Engine          │
│  (Ollama)   │  (Session)    │     (Bindings)            │
└──────┬──────┴───────┬───────┴───────────┬───────────────┘
       │              │                   │
       ▼              ▼                   ▼
   Ollama API   SessionMemory       agentBindings
   localhost    (auto-extract)     (Map registry)
```

### Moduli

| Modulo | File | Ruolo |
|--------|------|-------|
| **Entry Point** | `src/index.ts` | REPL readline con health check + streaming |
| **Ollama Adapter** | `src/adapters/ollama-adapter.ts` | Converte Anthropic → OpenAI SSE, drop-in per `callModel` |
| **Message Converter** | `src/adapters/ollama-message-converter.ts` | Traduzione bidirezionale Message[] ↔ OpenAI format |
| **Error Handler** | `src/adapters/ollama-errors.ts` | Classifica 7 tipi di errore, yield never throw |
| **DI Factory** | `query/localDeps.ts` | Override `callModel` → `ollamaCallModel`, abilita memory |
| **Memory** | `src/memory/enableLocalMemory.ts` | Attiva SessionMemory esistente via env gate |
| **Vim Bindings** | `src/vim/agentBindings.ts` | Registry Map con 5 bindings (ai, fix, explain, ctx, repeat) |

### Flusso delle query

```
User Input
    │
    ▼
localDeps.callModel()  ──→  ollamaCallModel()
    │                            │
    │                   Anthropic→OpenAI conversion
    │                            │
    │                    POST /v1/chat/completions
    │                            │
    │                      SSE stream parse
    │                            │
    ◄────────── yield StreamEvent (text deltas)
    │
    ▼
process.stdout.write()  ──→  realtime streaming
```

### Error Handling (Decisione #4)

```
Errore Ollama → classifyOllamaError() → yield SystemAPIErrorMessage
                    │
    ┌───────────────┼───────────────────────────┐
    │               │                           │
ECONNREFUSED    404 (model)    500+OOM      Timeout
"ollama serve"  "ollama pull"  "usa gemma3:4b"  "verifica"
    │               │              │              │
    └───────────────┴──────────────┴──────────────┘
                    │
            MAI throw, SEMPRE yield
```

---

## Test

```bash
# Esegui tutti i test (richiede Bun)
bun test src/__tests__/

# Test individuali
bun test src/__tests__/error-recovery.test.ts    # 12 test — error classification
bun test src/__tests__/ollama-adapter.test.ts     # 5 test  — stream + tool_use
bun test src/__tests__/memory-store.test.ts       # 6 test  — soglie + gate
bun test src/__tests__/localDeps.test.ts          # 6 test  — DI override

# Smoke test (senza Bun test runner)
bun run scripts/test-ollama.ts                    # Richiede Ollama running
bun run scripts/test-memory.ts                    # No Ollama necessario
bun run scripts/test-bindings.ts                  # No Ollama necessario
```

---

## Decisioni Architetturali

Tutte le decisioni tecniche sono documentate in [`DECISIONS.md`](./DECISIONS.md):

| # | Titolo | Scelta |
|---|--------|--------|
| 1 | DI Strategy | `localDeps()` con override solo `callModel` |
| 2 | Wrapper Strategy | Stessa firma Anthropic, ignora params non-Ollama |
| 3 | DI Implementation | Esplicita (no spread `productionDeps`) |
| 4 | Error Strategy | No retry localhost, yield never throw |
| 5 | SessionMemory | Riusa esistente via env var gate |
| 6 | Vim Bindings | Map registry, `buildAgentPrompt` puro |
| 7 | Test Runner | `bun:test` nativo, mock AsyncGenerator |
| 8 | Entry Point | REPL readline, no HTTP server |
| 9 | VS Code Frontend | Continue.dev diretto su Ollama |

---

## Continue.dev Integration

### Installazione

1. Installa **Continue.dev** da VS Code Extensions (ID: `Continue.continue`)
2. Il file `.continue/config.json` è già configurato nel repo
3. Avvia Ollama: `ollama serve`
4. Scarica il modello di embeddings: `ollama pull nomic-embed-text`
5. Apri VS Code sul repo: `code .`

### Comandi disponibili nell'editor

| Slash Command | Scopo |
|---------------|-------|
| `/fix` | Corregge il codice selezionato |
| `/explain` | Spiega in italiano |
| `/refactor` | Refactoring best practices |
| `/test` | Genera test bun:test |
| `/camelot` | Agente con contesto progetto completo |
| `/commit` | Genera messaggio commit dal diff |

### Shortcuts VS Code con Continue

| Shortcut | Azione |
|----------|--------|
| `Ctrl+L` | Apre chat Continue con selezione corrente |
| `Ctrl+Shift+L` | Aggiunge selezione alla chat aperta |
| `Ctrl+I` | Inline edit sul codice selezionato |
| `Tab` | Accetta autocomplete (gemma3:4b) |

### Embedding (indice semantico codebase)

```bash
ollama pull nomic-embed-text
```

Poi usa `@codebase` nella chat per domande sull'intero repo.
Esempio: `@codebase come funziona il layer DI?`

### Modelli configurati

| Modello | Uso | VRAM |
|---------|-----|------|
| `gemma3:27b` | Chat principale, /fix, /explain | ≥12GB |
| `gemma3:4b` | Tab autocomplete, fast queries | ≥6GB |
| `nomic-embed-text` | Indice semantico @codebase | ~1GB |

---

## Struttura File

```
h:\ai code\
├── .continue/
│   ├── config.json                       # Continue.dev configuration
│   └── prompts/
│       └── camelot-system.prompt         # System context prompt
├── src/
│   ├── index.ts                          # Entry point REPL
│   ├── adapters/
│   │   ├── ollama-adapter.ts             # Drop-in callModel
│   │   ├── ollama-message-converter.ts   # Anthropic ↔ OpenAI
│   │   └── ollama-errors.ts             # Error classification
│   ├── memory/
│   │   └── enableLocalMemory.ts          # SessionMemory activation
│   ├── vim/
│   │   └── agentBindings.ts              # Vim binding registry
│   └── __tests__/
│       ├── error-recovery.test.ts
│       ├── ollama-adapter.test.ts
│       ├── memory-store.test.ts
│       └── localDeps.test.ts
├── query/
│   └── localDeps.ts                      # DI factory
├── scripts/
│   ├── test-ollama.ts
│   ├── test-memory.ts
│   └── test-bindings.ts
├── services/
│   └── SessionMemory/
│       └── sessionMemory.patch.ts        # Upstream patch doc
├── README_CAMELOT.md
├── DECISIONS.md
├── CHANGELOG.md
├── SESSION_MEMORY.md
└── PROJECT_MAP.md
```

---

## Licenza

Progetto interno — contributi via GitHub: [`tony88pisa/project-camelot-utils`](https://github.com/tony88pisa/project-camelot-utils)

