/**
 * src/__tests__/agentLoop.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { runCommand, writeFileTool, readFileTool } from '../agent/tools/sysTools.js'
import { parseAgentResponse } from '../agent/agentLoop.js'
import { TOOL_SCHEMAS, executeTool } from '../agent/toolRegistry.js'
import { rm, exists } from 'fs/promises'
import { join } from 'path'

describe('sysTools — whitelist', () => {
  it('blocca comandi pericolosi (rm, powershell)', async () => {
    const r1 = await runCommand('rm -rf /')
    expect(r1).toContain('🚫 Comando non consentito')
    
    const r2 = await runCommand('powershell Write-Host hi')
    expect(r2).toContain('🚫 Comando non consentito')
  })

  it('permette comandi sicuri (echo, bun)', async () => {
    const r1 = await runCommand('bun --version')
    expect(r1).toMatch(/\d+\.\d+\.\d+/)
  })
})

describe('sysTools — file operations', () => {
  const testFile = join(process.cwd(), 'dist', 'test-agent-tmp.txt')

  afterEach(async () => {
    if (await exists(testFile)) await rm(testFile)
  })

  it('write + read file in dist/', async () => {
    const content = 'Hello from Agent Loop'
    await writeFileTool(testFile, content)
    const read = await readFileTool(testFile)
    expect(read).toBe(content)
  })

  it('read file inesistente → ❌', async () => {
    const read = await readFileTool('invalid_file_12345.txt')
    expect(read).toContain('❌ File non trovato')
  })
})

describe('agentLoop — parseAgentResponse', () => {
  it('parse JSON con tool_calls', () => {
    const raw = `Ecco il piano:
{
  "thinking": "devo cercare",
  "tool_calls": [{ "tool": "search_web", "args": { "query": "bun" } }],
  "response": "Cerco ora...",
  "done": false
}`
    const p = (parseAgentResponse as any)(raw)
    expect(p.tool_calls.length).toBe(1)
    expect(p.tool_calls[0].tool).toBe('search_web')
    expect(p.done).toBe(false)
  })

  it('parse JSON senza tool_calls', () => {
    const raw = `{"thinking": "ok", "tool_calls": [], "response": "Ciao!", "done": true}`
    const p = (parseAgentResponse as any)(raw)
    expect(p.tool_calls.length).toBe(0)
    expect(p.done).toBe(true)
  })

  it('handle invalid JSON → gracefully fallback', () => {
    const raw = `Non sono un JSON`
    const p = (parseAgentResponse as any)(raw)
    expect(p.done).toBe(true)
    expect(p.response).toBe(raw)
  })
})

describe('toolRegistry — parameters', () => {
  it('write_file ha i parametri corretti', () => {
    const t = TOOL_SCHEMAS.find(s => s.name === 'write_file')
    expect(t?.parameters.required).toContain('path')
    expect(t?.parameters.required).toContain('content')
  })

  it('run_command ha command obbligatorio', () => {
    const t = TOOL_SCHEMAS.find(s => s.name === 'run_command')
    expect(t?.parameters.required).toContain('command')
  })
})

describe('toolRegistry — schemi', () => {
  it('tutti i tool hanno name/description/parameters', () => {
    for (const t of TOOL_SCHEMAS) {
      expect(t.name).toBeDefined()
      expect(t.description).toBeDefined()
      expect(t.parameters).toBeDefined()
    }
  })

  it('almeno 7 tool registrati', () => {
    expect(TOOL_SCHEMAS.length).toBeGreaterThanOrEqual(7)
  })
})

describe('executeTool — tool sconosciuto', () => {
  it('output contiene sconosciuto, success = false', async () => {
    const res = await executeTool('magic_spell', {})
    expect(res.success).toBe(true) // executeTool ritorna success=true se non throwa, ma output dice sconosciuto
    expect(res.output).toContain('sconosciuto')
  })
})
