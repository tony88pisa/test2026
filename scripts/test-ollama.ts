/**
 * test-ollama.ts — Smoke test per verificare che Ollama sia raggiungibile
 * e che ollamaCallModel produca output valido.
 *
 * Esegui: bun run scripts/test-ollama.ts
 *
 * NON usa query() (troppo complesso, richiede tutto il bootstrap).
 * Testa DIRETTAMENTE ollamaCallModel come standalone.
 */

import { ollamaCallModel } from '../src/adapters/ollama-adapter.js'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

// ─── Step 1: Verifica che Ollama sia raggiungibile ──────────────────────────

console.log(`\n🔍 Controllo Ollama su ${OLLAMA_BASE_URL}...`)

try {
  const res = await fetch(`${OLLAMA_BASE_URL}/v1/models`)
  if (!res.ok) {
    console.error(`❌ Ollama risponde con ${res.status}: ${res.statusText}`)
    console.error('   Assicurati che Ollama sia avviato: ollama serve')
    process.exit(1)
  }
  const data = await res.json() as { data?: Array<{ id: string }> }
  console.log(`✅ Ollama raggiungibile — modelli disponibili:`)
  if (data.data) {
    for (const model of data.data) {
      console.log(`   - ${model.id}`)
    }
  }
} catch (err) {
  console.error(`❌ Impossibile contattare Ollama: ${err}`)
  console.error('   Avvia Ollama con: ollama serve')
  process.exit(1)
}

// ─── Step 2: Smoke test diretto di ollamaCallModel ──────────────────────────

console.log(`\n🧪 Smoke test: invio prompt a ollamaCallModel...`)

const abortController = new AbortController()

// Timeout di sicurezza: 60s max
const timeout = setTimeout(() => {
  console.error('⏱️  Timeout: 60s superati. Abort.')
  abortController.abort()
}, 60_000)

try {
  let gotAssistant = false
  let gotStreamEvent = false

  for await (const event of ollamaCallModel({
    messages: [
      {
        type: 'user',
        uuid: 'test-1',
        message: {
          role: 'user',
          content: 'Rispondimi con una sola parola: "funziona"',
        },
      },
    ] as any[],
    systemPrompt: 'Sei un assistente minimalista. Rispondi in modo breve.' as any,
    thinkingConfig: { type: 'disabled' } as any,
    tools: [] as any,
    signal: abortController.signal,
    options: {
      model: process.env.OLLAMA_MODEL ?? 'gemma3:27b',
      getToolPermissionContext: async () => ({}) as any,
      isNonInteractiveSession: true,
      querySource: 'sdk' as any,
      agents: [],
      hasAppendSystemPrompt: false,
      mcpTools: [],
    } as any,
  })) {
    // Log event types as they arrive
    if (event.type === 'stream_event') {
      const evt = (event as any).event
      if (evt?.type === 'message_start') {
        console.log(`   📡 message_start (model: ${evt.message?.model ?? '?'})`)
      } else if (evt?.type === 'content_block_delta') {
        const delta = evt?.delta
        if (delta?.type === 'text_delta') {
          process.stdout.write(delta.text ?? '')
        }
      } else if (evt?.type === 'message_delta') {
        console.log(`\n   📡 message_delta (stop: ${evt.delta?.stop_reason ?? '?'})`)
      } else if (evt?.type === 'message_stop') {
        console.log(`   📡 message_stop`)
      }
      gotStreamEvent = true
    }

    if (event.type === 'assistant') {
      const msg = event as any
      const content = msg.message?.content
      console.log(`\n✅ AssistantMessage ricevuto:`)
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            console.log(`   📝 "${block.text}"`)
          } else if (block.type === 'tool_use') {
            console.log(`   🔧 tool_use: ${block.name}(${JSON.stringify(block.input)})`)
          }
        }
      } else {
        console.log(`   📝 ${JSON.stringify(content)}`)
      }
      console.log(`   stop_reason: ${msg.message?.stop_reason ?? 'null'}`)
      gotAssistant = true
    }

    if (event.type === 'system' && (event as any).subtype === 'api_error') {
      console.error(`\n❌ API Error: ${(event as any).error}`)
    }
  }

  console.log(`\n─── Risultato ───`)
  console.log(`   StreamEvents ricevuti: ${gotStreamEvent ? '✅ sì' : '❌ no'}`)
  console.log(`   AssistantMessage ricevuto: ${gotAssistant ? '✅ sì' : '❌ no'}`)

  if (gotAssistant && gotStreamEvent) {
    console.log(`\n🎉 SMOKE TEST PASSATO — ollamaCallModel funziona!\n`)
  } else {
    console.log(`\n⚠️  Test parziale — verifica i log sopra\n`)
  }
} catch (err) {
  console.error(`\n❌ Errore durante il test:`, err)
} finally {
  clearTimeout(timeout)
}
