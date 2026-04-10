# Decision Log Camelot-IDE

---

## Decisione #1 — Strategia DI per sostituire callModel

**Data**: 2026-04-08
**Scelta**: localDeps() con override SOLO di `callModel`
**Alternativa scartata**: Fork di query.ts (copia e modifica del file)
**Motivazione**:
- Il file `query/deps.ts` espone già un sistema DI pulito con l'interfaccia `QueryDeps`
- La funzione `productionDeps()` restituisce 4 dipendenze: `callModel`, `microcompact`, `autocompact`, `uuid`
- Il punto di injection è in `query.ts:269`: `const deps = params.deps ?? productionDeps()`
- Per Ollama, serve sostituire SOLO `callModel` (= `queryModelWithStreaming`)
- `microcompact`, `autocompact` e `uuid` restano INVARIATI (non dipendono dal provider AI)
- Creare un fork di query.ts introdurrebbe duplicazione massiva (~1750 righe) e divergenza futura
- Con localDeps() si crea un file `query/localDeps.ts` che fa:
  ```ts
  export function localDeps(): QueryDeps {
    return {
      ...productionDeps(),
      callModel: ollamaCallModel, // solo questo cambia
    }
  }
  ```

**File impattati**:
- `query/localDeps.ts` (DA CREARE) — factory localDeps() che override callModel
- `src/adapters/ollama-adapter.ts` (DA CREARE) — implementazione ollamaCallModel
- `src/adapters/ollama-errors.ts` (DA CREARE) — errori specializzati + retry con p-retry

**Dipendenze da usare**:
- axios ^1.6.0 — HTTP client per chiamare Ollama /v1/chat/completions
- eventsource-parser ^1.1.2 — parsing SSE stream response
- p-retry ^6.2.0 — backoff esponenziale su errori transient
- p-timeout ^6.1.2 — timeout per chiamate Ollama

---

## Decisione #2 — Wrapper strategy per queryModelWithStreaming

**Data**: 2026-04-08
**Scelta**: Creare un wrapper che accetta la STESSA firma di `queryModelWithStreaming` ma ignora i parametri Anthropic-specifici
**Alternativa scartata**: Reimplementare tutto il layer Options (troppo fragile, >30 campi irrilevanti per Ollama)

**Motivazione**:
- `queryModelWithStreaming` ha firma: `{ messages, systemPrompt, thinkingConfig, tools, signal, options: Options }`
- Il tipo `Options` contiene ~30 campi (model, querySource, agents, mcpTools, effortValue, taskBudget, advisorModel, fastMode, ecc.)
- Per Ollama servono SOLO: `messages` (convertiti in OpenAI format), `tools` (convertiti in function schema), `signal` (abort), `options.model`
- I tipi in `types/message.ts` (h:\src) usano `[key: string]: unknown` — sono loose e permettono qualsiasi shape
- `StreamEvent = { type?: string; [key: string]: unknown }` — molto permissivo
- `AssistantMessage = MessageBase & { type: 'assistant'; message?: { content?: unknown } }` — altrettanto permissivo
- Il wrapper deve:
  1. Accettare `{ messages, systemPrompt, thinkingConfig, tools, signal, options }` identico alla firma reale
  2. Estrarre SOLO: messages → convertire Anthropic → OpenAI format
  3. Estrarre tools → convertire BetaToolUnion → OpenAI function schema
  4. Chiamare Ollama `/v1/chat/completions` con `stream: true` via axios
  5. Parsare SSE response con eventsource-parser
  6. Convertire delta chunks → `StreamEvent` + `AssistantMessage` finale
  7. Ignorare silenziosamente: thinkingConfig, effortValue, taskBudget, advisorModel, caching, fastMode
- Separare la logica di conversione messaggi in `ollama-message-converter.ts` per testabilità

**Firma reale letta dal codice** (services/api/claude.ts:761-788):
```ts
export async function* queryModelWithStreaming({
  messages,        // Message[]
  systemPrompt,    // SystemPrompt
  thinkingConfig,  // ThinkingConfig
  tools,           // Tools
  signal,          // AbortSignal
  options,         // Options (30+ campi)
}: {...}): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void>
```

**Conversione messaggi Anthropic → OpenAI**:
- `type:'user'` → `role:'user', content: string`
- `type:'assistant'` con `tool_use` blocks → `role:'assistant', tool_calls: [...]`
- `tool_result` → `role:'tool', tool_call_id, content`

**File impattati**:
- `src/adapters/ollama-adapter.ts` (DA CREARE) — wrapper principale
- `src/adapters/ollama-message-converter.ts` (DA CREARE) — conversione messaggi isolata

---

## Decisione #3 — localDeps inietta solo callModel

**Data**: 2026-04-08
**Scelta**: `localDeps()` esplicita con tutti e 4 i deps, override solo `callModel`
**Alternativa scartata**: Fork completo di `productionDeps()` (spread + override)

**Motivazione**:
- Usare `{ ...productionDeps(), callModel: ollamaCallModel }` sembra più pulito ma è fragile:
  se upstream aggiunge un 5° dep a `QueryDeps`, `productionDeps()` lo include automaticamente
  e potrebbe tirare un import Anthropic-specific che fallisce senza API key
- Con la versione esplicita (listare tutti e 4 i campi), se upstream aggiunge un campo
  il TypeScript compiler dà errore di tipo → il problema è visibile subito
- `microcompact`, `autocompact`, `uuid` NON dipendono dal provider AI,
  sono pure funzioni di compaction/UUID → sicure da usare direttamente
- Il file è 27 righe totali — la manutenibilità non è un problema

**Firma di compatibilità verificata**:
- `ollamaCallModel` accetta `options: Options` (tipo reale da services/api/claude.ts)
- Non più `PartialOptions` — ora matcha esattamente `typeof queryModelWithStreaming`

**File creato**: `query/localDeps.ts`

---

## Decisione #4 — No retry per Ollama locale + error yield strategy

**Data**: 2026-04-08
**Scelta**: Nessun retry per chiamate Ollama. Errori classificati e **yield come SystemAPIErrorMessage**, mai lanciati come eccezione.
**Alternativa scartata**: Backoff esponenziale con p-retry — inutile su localhost, aggiunge latenza (3-15s) senza benefici

**Motivazione**:
- Ollama gira su localhost — non ci sono problemi di rete, rate limit, o load balancer
- Se Ollama non risponde, è un problema di configurazione (non avviato, modello non scaricato, VRAM insufficiente)
- Un retry NON risolve nessuno di questi problemi — li ritarda e basta
- `p-retry` RIMOSSO dall'adapter (era nel codice PROMPT-2, ora eliminato)
- `p-timeout` MANTENUTO con 90s (cold start di Gemma 27B su RTX 5080 è ~10-30s)

**Scoperta critica da query.ts (SHA: 07e8b6f)**:
- Se callModel LANCIA (throw), query.ts fa catch e crea un generico `createAssistantAPIErrorMessage` → perde contesto
- Se callModel YIELD un SystemAPIErrorMessage, viene trattato come messaggio nel loop → il contesto è preservato
- **REGOLA**: ollamaCallModel NON deve mai lanciare. Deve SEMPRE yield un SystemAPIErrorMessage classificato.
- Eccezione: AbortError quando `signal.aborted` è true — ritorna silenziosamente (query.ts lo gestisce)

**Classificazione errori** (in `ollama-errors.ts`):
| Errore | Azione | shouldAbortLoop |
|--------|--------|-----------------|
| ECONNREFUSED | "Avvia: ollama serve" | ✅ true |
| 404 (model not found) | "Esegui: ollama pull gemma3:27b" | ✅ true |
| 500 + OOM/CUDA | "Prova: ollama run gemma3:4b" | ✅ true |
| Timeout (90s) | "Verifica: ollama serve && ollama list" | ✅ true |
| 413 / context length | Pass-through a query.ts autocompact | ❌ false |
| Abort | Return silenzioso | ❌ false |
| Unknown | Log con istruzioni per check | ❌ false |

**File creato**: `src/adapters/ollama-errors.ts`
**File aggiornato**: `src/adapters/ollama-adapter.ts` (rimosso p-retry, integrato ollama-errors)

---

## Decisione #5 — Non reimplementare SessionMemory, abilitare quello esistente via env var

**Data**: 2026-04-08
**Scelta**: Abilitare la SessionMemory esistente via `process.env.CAMELOT_SESSION_MEMORY = 'true'` + `setSessionMemoryConfig()` con soglie abbassate
**Alternativa scartata**: Creare `src/memory/localMemoryStore.ts` da zero — duplicazione codice, rischio conflitti con `runForkedAgent()`

**Motivazione**:
- Il codice originale Claude Code ha già un sistema di SessionMemory robusto.
- Abilitarlo via env var evita la duplicazione di codice e garantisce la compatibilità con i sub-agenti forked.

**File impattati**:
- `src/memory/enableLocalMemory.ts` (NEW)
- `services/SessionMemory/sessionMemory.ts` (MOD)

---

## Decisione #6 — Command registry Map per agent bindings (non switch/case)

**Data**: 2026-04-08
**Scelta**: `createAgentRegistry()` ritorna `Map<string, AgentBinding>`, ogni binding è `{ keys, mode, description, handler }`
**Alternativa scartata**: switch/case su key string — non estendibile, non testabile in isolamento

**Motivazione**:
- Map permette di aggiungere/rimuovere bindings a runtime (plugin pattern)
- Ogni handler è testabile in isolamento: `handler(ctx, deps)` restituisce un `AsyncGenerator<StreamEvent>`
- `buildAgentPrompt(ctx, binding)` è una funzione pura e testabile senza chiamare il modello

**File creato**: `src/vim/agentBindings.ts`

---

## Decisione #7 — Bun test runner nativo, mock di ollamaCallModel con AsyncGenerator sintetico

**Data**: 2026-04-08
**Scelta**: Test con `bun:test` (describe/it/expect/mock/beforeEach). Mock di callModel con AsyncGenerator che yield eventi sintetici.
**Alternativa scartata**: vitest — dipendenza extra non necessaria, Bun ha test runner built-in

**Motivazione**:
- `bun:test` è già disponibile senza installazione (parte del runtime Bun).
- Fornisce un'ottima velocità di esecuzione e facilità d'uso.

---

## Decisione #8 — REPL readline nativo come entry point, non HTTP server

**Data**: 2026-04-08
**Scelta**: `src/index.ts` usa un REPL interattivo readline (nativo Node/Bun). Entry point: `bun run src/index.ts`
**Alternativa scartata**: HTTP server — overhead inutile per uso locale CLI.

**Motivazione**:
- Camelot-IDE è un tool CLI locale, non un servizio web.
- `readline` fornisce un'esperienza utente semplice e reattiva per il terminale.

**File creato**: `src/index.ts`

---

## Decisione #9 — Continue.dev come frontend VS Code per Camelot-IDE

**Data**: 2026-04-08
**Scelta**: Continue.dev parla direttamente con Ollama (`localhost:11434`) per latenza minima. `localDeps` rimane attivo solo per il REPL `src/index.ts` e future tool integrations.
**Alternativa scartata**: Proxy HTTP su `:11435` — overhead inutile per uso personale.

**Motivazione**:
- Continue.dev ha supporto nativo per Ollama.
- Permette di avere un'interfaccia IDE completa senza dover riscrivere il frontend.

**File creati**: `.continue/config.json`, `.continue/prompts/camelot-system.prompt`

---

## Decisione #10 — memdir/findRelevantMemories usa sideQuery(), non deps.callModel

**Data**: 2026-04-08
**Scelta**: `findRelevantMemories.ts` chiama `sideQuery()` → `getAnthropicClient()` → SDK Anthropic diretto. È un **secondo binding point** separato da `deps.callModel`.

**Motivazione**:
- È necessario patchare `sideQuery` per reindirizzare le chiamate a Ollama in locale.

---

## Decisione #11 — autoDream disattivato per Ollama locale

**Data**: 2026-04-08
**Scelta**: Disattivare autoDream impostando `CAMELOT_AUTODREAM=false` nel gate.
**Alternativa scartata**: Redirigere verso Ollama — rischio OOM su VRAM durante task attivi.

**Motivazione**:
- autoDream fires runForkedAgent() in background. In locale con Ollama, questo potrebbe causare OOM se l'utente sta già usando la GPU.

**File creato**: `src/patches/disableAutoDream.ts`

---

## Decisione #12 — coordinatorMode.ts è solo config/prompt, non chiama callModel

**Data**: 2026-04-08
**Scelta**: `coordinatorMode.ts` NON chiama `callModel` né spawna agenti direttamente. È un contenitore di logic e prompt.

---

## Decisione #13 — sideQuery override via globalThis.__ollamaSideQuery

**Data**: 2026-04-08
**Scelta**: Implementare `ollamaSideQuery()` in `src/patches/patchSideQuery.ts` e registrarla su `globalThis`.

---

## Decisione #14 — Variabile env CAMELOT_LOCAL=1 come master switch locale

**Data**: 2026-04-08
**Scelta**: `CAMELOT_LOCAL=1` attiva tutti gli override locali.

---

## Decisione #15 — Coordinator Mode Activation via Statsig Bypass

**Data**: 2026-04-09
**Scelta**: Abilitazione del Coordinator Mode (multi-agent) forzando i feature gate Statsig a `true` quando `CAMELOT_LOCAL=1`.
**Alternativa scartata**: Mantenere il Coordinator disabilitato — limita le capacità dell'agente locale di delegare task complessi.

**Motivazione**:
- Il Coordinator permette di gestire workflow complessi tramite sub-agenti paralleli.
- I feature gate di Statsig (`COORDINATOR_MODE`, `tengu_scratch`) sono originariamente protetti da backend.
- In locale, iniettiamo uno stub in `stubs/statsigGate.ts` che bypassa ogni controllo se `CAMELOT_LOCAL=1`.
- `isCoordinatorMode()` in `coordinator/coordinatorMode.ts` funge da bridge tra l'ambiente e il gate.
- **Rischio VRAM**: Monitorato. L'utente è avvisato tramite `implementation_plan.md` che più agenti paralleli consumano più memoria video.

**File impattati**:
- `stubs/statsigGate.ts` (NEW) — Stub per feature gates
- `coordinator/coordinatorMode.ts` (NEW) — Bridge logic per Coordinator
- `src/memory/enableLocalMemory.ts` (MOD) — Rimozione blocco env var e attivazione bypass
- `src/__tests__/coordinator.test.ts` (NEW) — Test di verifica

---

## Decisione #16 — Bridge remoto bypassato in CAMELOT_LOCAL

**Data**: 2026-04-09
**Scelta**: Disattivazione del bridge remoto (Anthropic context) e sostituzione con stubs locali quando `CAMELOT_LOCAL=1`.
**Alternativa scartata**: Tentare di emulare il bridge completo — troppo complesso e non necessario per l'uso locale 100%.

**Motivazione**:
- Il bridge originale gestisce JWT, secret e connessioni ad `api.anthropic.com`.
- In modalità locale, vogliamo garantire il "zero telemetry" e l'autonomia da server esterni.
- Abbiamo creato stub minimali in `bridge/` (`jwtUtils.ts`, `workSecret.ts`, `bridgeEnabled.ts`, `bridgeConfig.ts`) per soddisfare le dipendenze degli import.
- `stubs/bridgeLocalBypass.ts` fornisce i mock necessari per test e integrazione.
- `isBridgeEnabled()` ora ritorna `false` immediatamente se `CAMELOT_LOCAL=1`.

**File impattati**:
- `bridge/` (NEW directory) — jwtUtils.ts, workSecret.ts, bridgeEnabled.ts, bridgeConfig.ts
- `stubs/bridgeLocalBypass.ts` (NEW) — Mocks per JWT e secrets
- `src/__tests__/bridge.test.ts` (NEW) — Test di verifica bypass

---

## Decisione #17 — Supermemory cross-session con fallback locale

**Data**: 2026-04-09
**Scelta**: Integrazione di `supermemory` come layer di memoria permanente. Priorità all'API `localhost:3000` (self-hosted) con fallback su `data/memory.json`.
**Alternativa scartata**: Usare solo il file locale — limita la capacità di ricerca semantica avanzata fornita da Supermemory.

**Motivazione**:
- La SessionMemory attuale è volatile (o legata alla cartella `.camelot` della singola sessione).
- Supermemory permette di mantenere un contesto evolutivo tra diverse sessioni di Camelot-IDE.
- La strategia di fallback garantisce che il sistema non crashi mai e continui a funzionare (in modalità degraded) anche senza il server di memoria avviato.

**File impattati**:
- `src/memory/supermemoryAdapter.ts` (NEW) — Logica di comunicazione e fallback
- `data/memory.json` (NEW) — Database locale per persistenza permanente
- `src/index.ts` (MOD) — Hook di salvataggio al shutdown
- `src/memory/enableLocalMemory.ts` (MOD) — Hook di recall al startup
- `src/__tests__/supermemory.test.ts` (NEW) — Test di verifica integrazione

---

## Decisione #18 — useMoreRight hook custom per interceptors

**Data**: 2026-04-09
**Scelta**: Implementazione di un hook `useMoreRight` caricato nel REPL loop per intercettare query e risposte.
**Alternativa scartata**: Modificare direttamente `handleQuery` — meno pulito, l'hook permette di aggiungere logica (Supermemory, autoDream) in modo modulare.

**Motivazione**:
- Permette di loggare ogni query locale in `data/memory.json.log`.
- Permette l'attivazione a runtime di autoDream tramite comando `!dream`.
- Integra Supermemory per salvare automaticamente ogni turno completato della conversazione.
- Gli stub di `upstreamproxy` risolvono le dipendenze degli import senza attivare traffico non necessario.

**File impattati**:
- `src/hooks/useMoreRight.ts` (NEW) — Hook di intercettazione
- `upstreamproxy/` (NEW directory) — relay.ts, upstreamproxy.ts stubs
- `src/index.ts` (MOD) — Integrazione hook nel loop REPL
- `src/__tests__/useMoreRight.test.ts` (NEW) — Test di verifica hook

---

## Decisione #19 — Skills bundled integrate

**Data**: 2026-04-09
**Scelta**: Implementazione di un sistema di "Skills" locali caricate dinamicamente e accessibili via prefisso `!`.
**Alternativa scartata**: Usare solo tool-calling — le skill offrono un'interfaccia utente (REPL) più immediata per compiti orchestrativi (batch, loop, memory).

**Motivazione**:
- Porting delle skill native di Camelot in ambiente locale senza dipendenze da Claude.
- Integrazione nativa con Supermemory (`!remember`, `!recall`).
- Miglioramento della resilienza tramite `!stuck` (analisi della ripetizione).
- Supporto ad automazioni batch locali.

**File impattati**:
- `skills/bundled/` (NEW directory) — remember, stuck, loop, batch, debug implementation
- `skills/skillify.ts` (NEW) — Sistema di caricamento e logging skill
- `src/index.ts` (MOD) — Integrazione `handleSkillCommand`
- `src/__tests__/skills.test.ts` (NEW) — Test di verifica sistema skill
