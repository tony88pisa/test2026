#!/usr/bin/env bun
/**
 * src/index.ts — Entry point per Camelot-IDE (REPL interattivo)
 */

import readline from 'readline'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { enableLocalMemory, getSessionMemoryPath, getSessionMemoryContent } from './memory/enableLocalMemory.js'
import { saveMemory } from './memory/supermemoryAdapter.js'
import { useMoreRight } from './hooks/useMoreRight.js'
import { skillify } from '../skills/skillify.js'
import * as skills from '../skills/bundled/index.js'
import { localDeps } from '../query/localDeps.js'
import type { QueryDeps } from '../query/deps.js'

// ─── Config ─────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:latest'

const SYSTEM_PROMPT = `Sei un assistente tecnico per il progetto Camelot-IDE.
Rispondi in italiano. Sei connesso a Gemma locale su Ollama.
Sei preciso, conciso, e produci codice pulito quando richiesto.`

const HELP_TEXT = `
┌─────────────────────────────────────────┐
│          Camelot-IDE — Comandi          │
38: ├─────────────────────────────────────────┤
│  :help      Mostra questo messaggio    │
│  :status    Stato sistema              │
│  :memory    Contenuto session memory   │
│  :quit      Salva ed esci              │
│  :exit      (alias di :quit)           │
│                                        │
│  !remember <k> <v>  Salva in Supermemory │
│  !recall <q>        Ricerca memoria       │
│  !stuck             Sblocca loop          │
│  !batch <file>      Esegui file query     │
│  !debug             Dump stato sessione   │
│                                        │
│  Testo libero → query a Gemma locale   │
└─────────────────────────────────────────┘
`

// ─── Utils ──────────────────────────────────────────────────────────────────

async function checkOllamaHealth(): Promise<{ ok: boolean; models: string[] }> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!res.ok) return { ok: false, models: [] }
    const data = await res.json() as { models: Array<{ name: string }> }
    const models = (data.models ?? []).map(m => m.name)
    return { ok: true, models }
  } catch {
    return { ok: false, models: [] }
  }
}

function printErrorBox(lines: string[]): void {
  const maxLen = Math.max(...lines.map(l => l.length))
  const width = maxLen + 4
  console.log('┌' + '─'.repeat(width) + '┐')
  for (const line of lines) {
    console.log('│  ' + line.padEnd(maxLen + 2) + '│')
  }
  console.log('└' + '─'.repeat(width) + '┘')
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

async function handleQuery(
  input: string,
  deps: QueryDeps,
  history: ConversationMessage[],
): Promise<void> {
  const messages = [
    ...history.map((msg, i) => ({
      type: msg.role as 'user' | 'assistant',
      uuid: `msg-${i}`,
      message: { role: msg.role, content: msg.role === 'assistant'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content,
      },
    })),
    {
      type: 'user' as const,
      uuid: randomUUID(),
      message: { role: 'user' as const, content: input },
    },
  ]

  history.push({ role: 'user', content: input })

  let fullResponse = ''

  try {
    const gen = deps.callModel({
      messages: messages as any[],
      systemPrompt: SYSTEM_PROMPT as any,
      thinkingConfig: { type: 'disabled' } as any,
      tools: [] as any,
      signal: new AbortController().signal,
      options: { model: OLLAMA_MODEL, querySource: 'repl_main_thread' } as any,
    })

    process.stdout.write('\n')

    for await (const event of gen) {
      if (event && typeof event === 'object') {
        const e = event as any
        if (e.type === 'stream_event' && e.event?.type === 'content_block_delta') {
          const text = e.event?.delta?.text ?? ''
          if (text) {
            process.stdout.write(text)
            fullResponse += text
          }
        }
        if (e.type === 'assistant' && e.message?.content) {
          const content = e.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text && !fullResponse.includes(block.text)) {
                process.stdout.write(block.text)
                fullResponse += block.text
              }
            }
          }
        }
        if (e.type === 'system' && e.subtype === 'api_error') {
          console.log(`\n\x1b[31m❌ ${e.error ?? e.message}\x1b[0m`)
          return
        }
      }
    }

    process.stdout.write('\n')

    if (fullResponse) {
      history.push({ role: 'assistant', content: fullResponse })
    }
  } catch (err) {
    console.log(`\n\x1b[31m❌ Errore: ${err instanceof Error ? err.message : String(err)}\x1b[0m`)
  }
}

async function handleCommand(
  cmd: string,
  deps: QueryDeps,
  startTime: number,
  history: ConversationMessage[]
): Promise<boolean> {
  const command = cmd.trim().toLowerCase()

  if (command === ':quit' || command === ':exit') {
    console.log('\n👋 Salvataggio memoria e chiusura...')
    try {
      const content = await getSessionMemoryContent() || '(sessione vuota)'
      await saveMemory('last session context', content)
    } catch { /* silent */ }
    return true
  }

  if (command === ':help') {
    console.log(HELP_TEXT)
    return false
  }

  if (command === ':status') {
    const health = await checkOllamaHealth()
    const uptime = Math.round((Date.now() - startTime) / 1000)
    let memPath = '(non disponibile)'
    try { memPath = getSessionMemoryPath() } catch { /* */ }

    console.log(`
┌─────────────────────────────────────────┐
│          Camelot-IDE — Status           │
├─────────────────────────────────────────┤
│  Ollama:   ${health.ok ? '✅ connesso' : '❌ disconnesso'}${' '.repeat(health.ok ? 17 : 14)}│
│  Modello:  ${OLLAMA_MODEL.padEnd(28)}│
│  Modelli:  ${(health.models.slice(0, 3).join(', ') || 'nessuno').padEnd(28)}│
│  Memoria:  ${memPath.length > 28 ? '...' + memPath.slice(-25) : memPath.padEnd(28)}│
│  Uptime:   ${(uptime + 's').padEnd(28)}│
└─────────────────────────────────────────┘`)
    return false
  }

  if (command === ':memory') {
    try {
      const content = await getSessionMemoryContent()
      if (content) {
        console.log('\n📝 Session Memory:\n')
        console.log(content)
      } else {
        console.log('\n📝 Session memory vuota (non ancora inizializzata)')
      }
    } catch (err) {
      console.log(`\n⚠️  Errore lettura memoria: ${err instanceof Error ? err.message : String(err)}`)
    }
    return false
  }

  if (command.startsWith('!')) {
    return await handleSkillCommand(cmd, deps, history)
  }

  console.log(`\n⚠️  Comando sconosciuto: ${cmd}`)
  console.log('Digita :help per la lista dei comandi.')
  return false
}

async function handleSkillCommand(
  cmd: string,
  deps: QueryDeps,
  history: ConversationMessage[]
): Promise<boolean> {
  const parts = cmd.split(' ')
  const skillName = parts[0].toLowerCase()

  switch (skillName) {
    case '!remember': {
      const key = parts[1]
      const value = parts.slice(2).join(' ')
      if (!key || !value) {
        console.log('Uso: !remember <key> <value>')
        return false
      }
      const skill = skillify('remember', skills.saveContext)
      await skill(key, value)
      console.log(`✅ Ricordato: ${key}`)
      return false
    }

    case '!recall': {
      const query = parts.slice(1).join(' ')
      if (!query) {
        console.log('Uso: !recall <query>')
        return false
      }
      const skill = skillify('recall', skills.recallContext)
      const results = await skill(query)
      console.log(`\n🔍 Risultati recall per "${query}":`)
      results.forEach((r, i) => console.log(`[${i + 1}] ${r}`))
      return false
    }

    case '!stuck': {
      const skill = skillify('stuck', skills.unstick)
      const prompt = skill()
      console.log(`\n⚠️  Stuck detectato. Invio prompt speciale...`)
      await handleQuery(prompt, deps, history)
      return false
    }

    case '!batch': {
      const file = parts[1]
      if (!file || !existsSync(file)) {
        console.log(`Uso: !batch <file.txt> (File non trovato: ${file})`)
        return false
      }
      const content = readFileSync(file, 'utf-8')
      const queries = content.split('\n').map(q => q.trim()).filter(q => q)
      const skill = skillify('batch', skills.runBatch)
      await skill(queries, deps, handleQuery, history)
      return false
    }

    case '!debug': {
      const skill1 = skillify('dumpState', skills.dumpState)
      const skill2 = skillify('traceLastTurn', skills.traceLastTurn)
      skill1(history)
      skill2(history)
      return false
    }

    default:
      console.log(`\n⚠️  Skill sconosciuta: ${skillName}`)
      return false
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n\x1b[1m🏰 Camelot-IDE v0.1.0\x1b[0m')
  console.log('   IDE agentico locale con Gemma + Vim engine\n')

  process.stdout.write('🔍 Controllo Ollama... ')
  const health = await checkOllamaHealth()

  if (!health.ok) {
    console.log('❌')
    printErrorBox([
      '❌ Ollama non raggiungibile',
      `   URL: ${OLLAMA_BASE_URL}`,
      '',
      'Esegui:',
      '  ollama serve',
      '  ollama pull gemma4:latest',
    ])
    process.exit(1)
  }
  console.log('✅')

  const hasModel = health.models.some(m => m.includes('gemma4'))
  if (hasModel) {
    const gemmaModels = health.models.filter(m => m.includes('gemma4'))
    console.log(`✅ Modello trovato: ${gemmaModels.join(', ')}`)
  } else {
    console.log(`⚠️  gemma4:latest non trovato. Modelli disponibili: ${health.models.join(', ') || 'nessuno'}`)
    console.log(`   Esegui: ollama pull gemma4:latest`)
  }

  try {
    enableLocalMemory()
    let memPath = '(path non disponibile)'
    try { memPath = getSessionMemoryPath() } catch { /* */ }
    console.log(`✅ Session memory attiva → ${memPath}`)
  } catch (err) {
    console.log(`⚠️  Session memory non disponibile: ${err instanceof Error ? err.message : String(err)}`)
  }

  const deps = localDeps()

  // 🛡️ Auth Token Check
  if (!process.env.CAMELOT_AUTH_TOKEN) {
    const token = randomUUID()
    console.log('\x1b[33m[camelot] ⚠️  CAMELOT_AUTH_TOKEN non impostato\x1b[0m')
    console.log(`\x1b[1m[camelot] 🔑 Token temporaneo sessione: \x1b[32m${token}\x1b[0m`)
    process.env.CAMELOT_AUTH_TOKEN = token
  }

  console.log(`✅ Camelot-IDE pronto (${OLLAMA_MODEL})`)
  console.log(HELP_TEXT)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m> \x1b[0m',
    historySize: 100,
  })

  const conversationHistory: ConversationMessage[] = []
  const startTime = Date.now()

  const hook = useMoreRight({
    enabled: true,
    setMessages: () => {},
    inputValue: '',
    setInputValue: () => {},
    setToolJSX: () => {},
  })

  let shuttingDown = false
  process.on('SIGINT', async () => {
    if (shuttingDown) process.exit(0)
    shuttingDown = true
    console.log('\n\n👋 Interruzione — salvataggio e chiusura...')
    try {
      const content = await getSessionMemoryContent()
      await saveMemory('last session context', content || '(sessione interrotta)')
    } catch { /* silent */ }
    rl.close()
  })

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    if (input.startsWith(':') || input.startsWith('!')) {
      const shouldExit = await handleCommand(input, deps, startTime, conversationHistory)
      if (shouldExit) { rl.close(); return }
      rl.prompt()
      return
    }

    const shouldContinue = await hook.onBeforeQuery(input, conversationHistory, conversationHistory.length)
    if (!shouldContinue) { rl.prompt(); return }

    await handleQuery(input, deps, conversationHistory)
    await hook.onTurnComplete(conversationHistory, false)
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\n🏰 Arrivederci da Camelot-IDE!\n')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('❌ Errore fatale:', err)
  process.exit(1)
})
