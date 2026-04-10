import type { Skill, SkillContext } from '../types.js'
import { searchWeb, readPage } from '../../adapters/browserAdapter.js'
import { getCached, setCache } from '../../adapters/searchCache.js'
import { saveMemory } from '../../memory/sessionContext.js'

export const searchWebSkill: Skill = {
  name: 'search-web',
  trigger: '/search-web',
  description: 'Cerca su internet e restituisce risultati contestuali.',

  async run(ctx: SkillContext): Promise<{ content: string }> {
    const query = ctx.messages.at(-1)?.content.trim() || ''
    if (!query) return { content: 'Specifica cosa cercare.' }

    // 1. Controlla cache
    const cached = getCached(query)
    if (cached) {
      return { content: `[cache] ${JSON.stringify(cached.results, null, 2)}` }
    }

    // 2. Ricerca browser
    let results
    try {
      results = await searchWeb(query, 5)
    } catch (e) {
      return { content: `Errore ricerca: ${e}` }
    }

    if (!results.length) return { content: 'Nessun risultato trovato.' }

    // 3. Leggi prima pagina per contenuto completo
    let pageContent = ''
    try {
      const first = results[0]
      if (first.url.startsWith('http')) {
        const page = await readPage(first.url)
        pageContent = page.content.slice(0, 3000)
      }
    } catch { /* fallback solo snippet */ }

    // 4. Salva in cache
    setCache(query, results)

    // 5. Salva in SuperMemory
    await saveMemory({
      sessionId: 'web-search',
      content:   `Query: ${query}\nRisultati: ${results.map(r => r.title).join(', ')}`,
      metadata: {
        type:      'session',
        timestamp: Date.now(),
      },
    })

    // 6. Formatta output per gemma4
    const formatted = results.map((r, i) =>
      `${i+1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
    ).join('\n\n')

    return {
      content: pageContent
        ? `${formatted}\n\n── Contenuto primo risultato ──\n${pageContent}`
        : formatted
    }
  }
}

// Skill secondaria: leggi una URL specifica
export const readPageSkill: Skill = {
  name: 'read-page',
  trigger: '/read-page',
  description: 'Legge e estrae il testo da una URL specificata.',

  async run(ctx: SkillContext): Promise<{ content: string }> {
    const url = ctx.messages.at(-1)?.content.trim() || ''
    if (!url.startsWith('http')) return { content: 'URL non valida.' }

    try {
      const { title, content } = await readPage(url)
      
      await saveMemory({
        sessionId: 'page-read',
        content: `Pagina letta: ${title} (${url})`,
        metadata: { type: 'snippet', timestamp: Date.now() },
      })

      return { content: `# ${title}\n\n${content}` }
    } catch (e) {
      return { content: `Errore lettura pagina: ${e}` }
    }
  }
}
