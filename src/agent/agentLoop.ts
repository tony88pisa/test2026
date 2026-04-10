/**
 * src/agent/agentLoop.ts
 */
import { TOOL_SCHEMAS, executeTool, type ToolResult } from './toolRegistry.js'
import { saveMemory } from '../memory/sessionContext.js'

const OLLAMA_URL = process.env.OLLAMA_URL  ?? 'http://localhost:11434'
const MODEL      = process.env.CAMELOT_MODEL ?? 'gemma4:latest'
const MAX_TURNS  = 5

export interface AgentMessage {
  role:    'user' | 'assistant' | 'system' | 'tool'
  content: string
  name?:   string
}

export interface AgentResult {
  response:   string
  toolCalls:  ToolResult[]
  turns:      number
  sessionId?: string
}

function buildSystemPrompt(): string {
  const toolList = TOOL_SCHEMAS.map(t =>
    `- ${t.name}(${Object.keys(t.parameters.properties).join(', ')}): ${t.description}`
  ).join('\n')

  return `Sei Ember, l'assistente AI di Camelot IDE — uno shiny 🦊.
Sei preciso, efficiente e autonomo.

HAI ACCESSO AI SEGUENTI STRUMENTI:
${toolList}

REGOLE:
1. Quando l'utente chiede qualcosa che richiede un tool, usalo.
2. Rispondi SEMPRE con JSON valido in questo formato:
{
  "thinking": "ragionamento interno breve",
  "tool_calls": [
    { "tool": "nome_tool", "args": { "param": "valore" } }
  ],
  "response": "risposta finale in italiano per l'utente",
  "done": true
}
3. Se NON servono tool: tool_calls = [], done = true.
4. Se hai bisogno di più step: done = false, esegui un tool alla volta.
5. Parla sempre in italiano, sii conciso.
6. Non inventare risultati — usa i tool per fatti reali.`
}

async function callOllama(messages: AgentMessage[]): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   MODEL,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream:  false,
      format:  'json',
      options: { temperature: 0.3, num_predict: 2048 }
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const json = await res.json() as { message?: { content: string } }
  return json.message?.content ?? '{}'
}

export function parseAgentResponse(raw: string) {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Nessun JSON trovato')
    const p = JSON.parse(match[0])
    return {
      thinking:   String(p.thinking  ?? ''),
      tool_calls: Array.isArray(p.tool_calls) ? p.tool_calls : [],
      response:   String(p.response  ?? ''),
      done:       p.done !== false
    }
  } catch {
    return { thinking: '', tool_calls: [], response: raw, done: true }
  }
}

export async function runAgentLoop(
  userMessage: string,
  history: AgentMessage[] = [],
  sessionId?: string
): Promise<AgentResult> {
  const allToolResults: ToolResult[] = []
  let turns = 0
  const messages: AgentMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user',   content: userMessage }
  ]
  let finalResponse = ''

  while (turns < MAX_TURNS) {
    turns++
    console.log(`[agent] Turn ${turns}/${MAX_TURNS}`)

    let raw: string
    try { raw = await callOllama(messages) }
    catch (e) { finalResponse = `❌ Errore connessione Ollama: ${e}`; break }

    const parsed = parseAgentResponse(raw)
    if (parsed.thinking) console.log(`[agent] 💭 ${parsed.thinking}`)

    if (!parsed.tool_calls.length || parsed.done) {
      finalResponse = parsed.response || raw
      break
    }

    const toolResults: ToolResult[] = []
    for (const call of parsed.tool_calls) {
      console.log(`[agent] 🔧 ${call.tool}(${JSON.stringify(call.args)})`)
      const result = await executeTool(call.tool, call.args ?? {})
      toolResults.push(result)
      allToolResults.push(result)
    }

    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content: 'Risultati tool:\n' +
        toolResults.map(r =>
          `[${r.tool}]: ${r.success ? r.output : '❌ ' + r.output}`
        ).join('\n\n') +
        '\n\nContinua o fornisci la risposta finale.'
    })

    if (parsed.done) { finalResponse = parsed.response; break }
  }

  if (turns >= MAX_TURNS && !finalResponse) {
    finalResponse = `⚠️ Raggiunto limite di ${MAX_TURNS} iterazioni. Ultimo output: ${
      allToolResults.at(-1)?.output?.slice(0, 500) ?? 'nessuno'
    }`
  }

  try {
    await saveMemory({
      sessionId: sessionId || 'agent-session',
      content: `User: ${userMessage}\nAgent: ${finalResponse.slice(0,500)}`,
      metadata: {
        type:      'session',
        timestamp: Date.now(),
        // Extra info nel content per recallMemory (Substring match richiede testo)
        files:     allToolResults.map(r => r.tool), // abusi per tag
      },
    })
  } catch { /* non bloccare */ }

  return { response: finalResponse, toolCalls: allToolResults, turns, sessionId }
}
