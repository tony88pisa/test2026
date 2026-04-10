import { chromium, type Browser, type Page } from 'playwright'

export interface SearchResult {
  title:   string
  url:     string
  snippet: string
}

export interface PageContent {
  url:     string
  title:   string
  content: string   // testo pulito, no HTML
  fetchedAt: number
}

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',   // headless non usa GPU
      ]
    })
  }
  return browserInstance
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

// ─── Ricerca DuckDuckGo ───
export async function searchWeb(
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.goto(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { waitUntil: 'domcontentloaded', timeout: 15_000 }
    )

    const results = await page.$$eval(
      '.result',
      (els, max) => els.slice(0, max).map(el => ({
        title:   el.querySelector('.result__title')?.textContent?.trim() ?? '',
        url:     el.querySelector('.result__url')?.textContent?.trim() ?? '',
        snippet: el.querySelector('.result__snippet')?.textContent?.trim() ?? '',
      })),
      maxResults
    )

    return results.filter(r => r.title && r.url)
  } finally {
    await page.close()
  }
}

// ─── Lettura pagina singola ───
export async function readPage(url: string): Promise<PageContent> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000
    })

    const title = await page.title()

    // Rimuovi nav, footer, script, style, ads
    const content = await page.evaluate(() => {
      const remove = ['nav','footer','header','script',
                      'style','aside','.ad','#cookie']
      remove.forEach(sel => {
        document.querySelectorAll(sel)
          .forEach(el => el.remove())
      })
      // Prendi il main content o il body
      const main = document.querySelector('main')
               ?? document.querySelector('article')
               ?? document.body
      return main ? main.innerText
        .replace(/\n{3,}/g, '\n\n')  // normalizza whitespace
        .trim()
        .slice(0, 8000) : ''               // max 8000 char per gemma4
    })

    return { url, title, content, fetchedAt: Date.now() }
  } finally {
    await page.close()
  }
}
