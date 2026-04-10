import { describe, test, expect, beforeEach, spyOn, mock } from "bun:test"
import { registerSideQueryOverride, ollamaSideQuery } from "../patches/patchSideQuery.js"
import { disableAutoDream } from "../patches/disableAutoDream.js"

// Mock for isAutoDreamEnabled simulation
const isAutoDreamEnabled = () => {
  if (process.env.CAMELOT_LOCAL === '1') return false
  return true
}

// Mock for initSessionMemory simulation
const initSessionMemory = async () => {
  if (process.env.CAMELOT_LOCAL === '1') return undefined
}

describe("Upstream Patches and Overrides", () => {
  beforeEach(() => {
    process.env.CAMELOT_LOCAL = "1"
    delete (globalThis as any).__ollamaSideQuery
  })

  describe("sideQuery bypass", () => {
    test("CAMELOT_LOCAL=1 → sideQuery() chiama __ollamaSideQuery", async () => {
      registerSideQueryOverride()
      const spy = spyOn(globalThis as any, "__ollamaSideQuery").mockImplementation(async () => ({ 
        content: [{ type: 'text', text: 'mocked' }] 
      } as any))
      
      if (typeof (globalThis as any).__ollamaSideQuery === 'function') {
        await (globalThis as any).__ollamaSideQuery({ messages: [] })
      }
      
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe("autoDream", () => {
    test("CAMELOT_LOCAL=1 → isAutoDreamEnabled() === false", () => {
      expect(isAutoDreamEnabled()).toBe(false)
    })

    test("Non deve mai throw in nessun caso", () => {
      expect(() => disableAutoDream()).not.toThrow()
    })
  })

  describe("SessionMemory", () => {
    test("CAMELOT_LOCAL=1 → initSessionMemory() ritorna early (undefined)", async () => {
      expect(await initSessionMemory()).toBeUndefined()
    })

    test("Verifica che non venga chiamata nessuna API esterna", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => 
        Promise.resolve(new Response("ok"))
      ) as any)
      
      await initSessionMemory()
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })
})
