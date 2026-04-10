// ============================================================
// MODULO: fileTools v1.0
// REGOLA: Fornisce all'Agent l'abilità di leggere il file system vero,
//         anche fuori dal workspace (es. percorsi assoluti forniti dall'utente).
// ============================================================

import fs from 'fs'
import path from 'path'

/** 
 * Llista i file in una cartella in modo ricorsivo.
 */
export function listDir(dirPath: string, depth = 3, current = 0): string[] {
  if (current > depth) return []
  if (!fs.existsSync(dirPath)) throw new Error(`Cartella inesistente: ${dirPath}`)
  
  const results: string[] = []
  try {
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      if (['node_modules', '.git', '.cache', 'dist'].includes(item)) continue
      const fullPath = path.join(dirPath, item)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
            results.push(`[DIR] ${fullPath}`)
            results.push(...listDir(fullPath, depth, current + 1))
        } else {
            results.push(`[FILE] ${fullPath}`)
        }
      } catch { }
    }
  } catch (err) {
    console.error(`Errore listDir su ${dirPath}:`, err)
  }
  return results
}

/** 
 * Legge il contenuto testuale di un file. 
 */
export function readFile(filePath: string): string {
    const absolutPath = path.resolve(filePath)
    if (!fs.existsSync(absolutPath)) {
        throw new Error(`File non trovato: ${absolutPath}`)
    }
    
    const stat = fs.statSync(absolutPath)
    if (stat.isDirectory()) {
        throw new Error(`Il percorso punta a una cartella, usa listDir: ${absolutPath}`)
    }
    if (stat.size > 2 * 1024 * 1024) {
        throw new Error(`Il file è troppo grande (> 2MB): ${absolutPath}`)
    }

    return fs.readFileSync(absolutPath, 'utf-8')
}

/**
 * Ricerca una query di testo nei file (in puro Node)
 */
export function searchCode(dirPath: string, query: string): { path: string, line: number, text: string }[] {
    const files = listDir(dirPath, 5) // max profondità 5 per ricerca testuale
    const matches: { path: string, line: number, text: string }[] = []
    
    for (const entry of files) {
        if (!entry.startsWith('[FILE] ')) continue
        const filePath = entry.replace('[FILE] ', '')
        
        try {
            // Saltiamo file grossi o binari
            const stat = fs.statSync(filePath)
            if (stat.size > 1024 * 1024) continue 
            if (!['.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.md', '.json', '.txt', '.go', '.rs'].includes(path.extname(filePath))) {
              if (path.extname(filePath) !== '') continue
            }
            
            const content = fs.readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(query)) {
                    matches.push({
                        path: filePath,
                        line: i + 1,
                        text: lines[i].trim()
                    })
                    if (matches.length > 50) return matches // limite 50 hit
                }
            }
        } catch { }
    }
    
    return matches
}
