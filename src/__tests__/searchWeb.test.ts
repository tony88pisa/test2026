import { describe, it, expect, mock, spyOn, afterEach } from 'bun:test'
import { getCached, setCache, clearCache }
  from '../adapters/searchCache.js'

describe('searchCache', () => {
  afterEach(() => clearCache())

  it('restituisce null per query non in cache', () => {
    expect(getCached('query inesistente xyz')).toBeNull()
  })

  it('salva e recupera una entry', () => {
    setCache('test query', [{ title: 'Test', url: 'http://test.com' }])
    const c = getCached('test query')
    expect(c).not.toBeNull()
    expect(c?.query).toBe('test query')
  })

  it('normalizza case e spazi', () => {
    setCache('  TypeScript Array  ', ['result'])
    expect(getCached('typescript array')).not.toBeNull()
  })

  it('clearCache svuota tutto', () => {
    setCache('qualcosa', ['x'])
    clearCache()
    expect(getCached('qualcosa')).toBeNull()
  })
})

// Mock Playwright per evitare browser reali nei test
describe('searchWebSkill (mock browser)', () => {
  it('skill restituisce stringa non vuota con risultati mock', async () => {
    // Mocka browserAdapter prima dell'import
    const mockResults = [
      { title: 'Go GC', url: 'https://go.dev/doc/gc', snippet: 'Go garbage collector...' }
    ]
    // Test con cache pre-popolata (zero browser)
    setCache('garbage collector go', mockResults)
    
    // Importiamo la skill (che userà la cache)
    const { searchWebSkill } = await import('../skills/builtin/searchWeb.js')
    const out = await searchWebSkill.run({
        messages: [{ role: 'user', content: 'garbage collector go' }],
        args: {},
        workspacePath: process.cwd()
    })
    
    expect(out.content).toContain('[cache]')
    expect(out.content.length).toBeGreaterThan(0)
    clearCache()
  })

  it('readPageSkill restituisce contenuto mockato', async () => {
    // Mockiamo readPage direttamente nel modulo
    const browserAdapter = await import('../adapters/browserAdapter.js')
    const spy = spyOn(browserAdapter, 'readPage').mockImplementation(async (url: string) => ({
      url,
      title: 'Mock Title',
      content: 'Mock Content',
      fetchedAt: Date.now()
    }))

    const { readPageSkill } = await import('../skills/builtin/searchWeb.js')
    const out = await readPageSkill.run({
        messages: [{ role: 'user', content: 'http://test.com/page' }],
        args: {},
        workspacePath: process.cwd()
    })
    
    expect(out.content).toContain('Mock Title')
    spy.mockRestore()
  })
})
