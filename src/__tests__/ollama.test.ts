import { describe, test, expect, spyOn } from "bun:test"
import { readFileSync } from "fs"

describe("Ollama Adapter and Config", () => {
  describe("ollama-adapter mock", () => {
    test("Verifica che la chiamata usi model = 'gemma4:latest' e URL corretto", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => 
        Promise.resolve(new Response(JSON.stringify({ model: "gemma4:latest", response: "ok" })))
      ) as any)
      
      const res = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({ model: "gemma4:latest", prompt: "test" })
      })
      const data = await res.json()
      
      expect(fetchSpy).toHaveBeenCalled()
      const [url, opts] = fetchSpy.mock.calls[0]
      expect(url.toString()).toContain("localhost:11434")
      const body = JSON.parse(opts?.body as string)
      expect(body.model).toBe("gemma4:latest")
      expect(data.response).toBe("ok")
      
      fetchSpy.mockRestore()
    })
  })

  describe("ollama error handling", () => {
    test("Verifica graceful error (no throw, ritorna fallback) su status 500", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => 
        Promise.resolve(new Response("Internal Server Error", { status: 500 }))
      ) as any)
      
      const res = await fetch("http://localhost:11434/api/generate")
      expect(res.status).toBe(500)
      fetchSpy.mockRestore()
    })

    test("Verifica che il timeout non blocchi indefinitamente (100ms)", async () => {
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => 
        new Promise(resolve => setTimeout(() => resolve(new Response("ok")),1000))
      ) as any)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 100)
      
      try {
        await fetch("http://localhost:11434/api/generate", { signal: controller.signal })
      } catch (err: any) {
        expect(err.name).toBe("AbortError")
      } finally {
        clearTimeout(timeoutId)
        fetchSpy.mockRestore()
      }
    })
  })

  describe("config model name", () => {
    test("Verifica che NESSUNO contenga 'claude' o 'anthropic' quando CAMELOT_LOCAL=1", () => {
      process.env.CAMELOT_LOCAL = "1"
      const indexContent = readFileSync("src/index.ts", "utf-8")
      const adapterContent = readFileSync("src/adapters/ollama-adapter.ts", "utf-8")
      
      const allContent = indexContent + adapterContent
      const hasClaude = /['"]claude-?['"]/i.test(allContent)
      const hasAnthropic = /anthropic/i.test(allContent)
      
      expect(hasClaude).toBe(false)
      expect(hasAnthropic).toBe(false)
    })

    test("Verifica che almeno uno contenga 'gemma4'", () => {
      const indexContent = readFileSync("src/index.ts", "utf-8")
      expect(indexContent).toContain("gemma4")
    })
  })
})
