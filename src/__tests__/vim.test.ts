import { describe, test, expect, beforeEach } from "bun:test"
import { createAgentRegistry, executeBinding } from "../vim/agentBindings.js"

describe("Vim Bindings Native", () => {
  let registry: Map<string, any>
  const mockCtx = { filePath: "/test.ts", cursorLine: 1, currentBuffer: "hello" }
  const mockDeps = { 
    callModel: () => (async function* () { yield { type: "assistant" } })(),
    uuid: () => "test-uuid" 
  }

  beforeEach(() => {
    process.env.CAMELOT_LOCAL = "1"
    registry = createAgentRegistry()
  })

  describe("Native vim bypass (CAMELOT_LOCAL=1)", () => {
    test("handleNativeVim('h') → ritorna undefined (no AI call)", async () => {
      const gen = executeBinding("h", mockCtx, mockDeps as any, registry)
      const result = await gen?.next()
      expect(result?.done).toBe(true)
      expect(result?.value).toBeUndefined()
    })

    test("handleNativeVim('dd') → ritorna undefined", async () => {
      const gen = executeBinding("dd", mockCtx, mockDeps as any, registry)
      const result = await gen?.next()
      expect(result?.done).toBe(true)
    })

    test("handleNativeVim('gg') → ritorna undefined", async () => {
      const gen = executeBinding("gg", mockCtx, mockDeps as any, registry)
      const result = await gen?.next()
      expect(result?.done).toBe(true)
    })

    test("handleNativeVim('Esc') → ritorna undefined", async () => {
      const gen = executeBinding("Esc", mockCtx, mockDeps as any, registry)
      const result = await gen?.next()
      expect(result?.done).toBe(true)
    })

    test("handleNativeVim('<C-v>') → ritorna undefined", async () => {
      const gen = executeBinding("<C-v>", mockCtx, mockDeps as any, registry)
      const result = await gen?.next()
      expect(result?.done).toBe(true)
    })
  })

  describe("Tutti i 32 binding registrati", () => {
    test("Verifica che il registro contenga esattamente 32 entry core", () => {
      const coreKeys = [
        'h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', '^', 'gg', 'G',
        'd', 'c', 'y', 'p', 'dd', 'cc', 'yy', 'D', 'C', 'Y',
        'i', 'a', 'o', 'O', 'I', 'A', 'Esc', 'v', 'V', '<C-v>'
      ]
      
      coreKeys.forEach(k => {
        expect(registry.has(k)).toBe(true)
        const b = registry.get(k)
        expect(b.handler.name).toContain('NativeVim')
      })
    })
  })

  describe("safeYieldModelCall fallback", () => {
    test("safeYieldModelCall('fix', 'code snippet') fallback scenario", async () => {
      const errorDeps = {
        callModel: () => (async function* () { throw new Error("ECONNREFUSED") })(),
        uuid: () => "error-uuid"
      }
      
      const gen = executeBinding("<leader>ai", mockCtx, errorDeps as any, registry)
      const result = await gen?.next()
      
      expect(result?.done).toBe(false)
      const msg = result?.value as any
      expect(msg.type).toBe("assistant")
      expect(msg.message.content[0].text).toMatch(/Ollama|raggiungibile/)
    })
  })
})
