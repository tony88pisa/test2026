// ============================================================
// SKILL: codeSearch v1.0.0
// REGOLA: Cerca pattern nel workspace tramite Bun.spawn (ripgrep/findstr)
//         Usa ripgrep se disponibile, fallback a findstr su Windows
// ============================================================

import { join } from 'path'

const WORKSPACE = process.env.WORKSPACE_PATH ?? process.cwd()

export interface SearchResult {
  file:   string
  line:   number
  column: number
  text:   string
}

export async function search(
  pattern: string,
  options?: { caseSensitive?: boolean; fileGlob?: string }
): Promise<SearchResult[]> {
  const { caseSensitive = false, fileGlob = '*.ts' } = options ?? {}

  try {
    // Prova ripgrep prima (se installato nel PATH)
    const args = ['rg', '--json', '--glob', fileGlob]
    if (!caseSensitive) args.push('-i')
    args.push(pattern, WORKSPACE)

    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
    const out  = await new Response(proc.stdout).text()
    const code = await proc.exited

    if (code <= 1) { // 0 = trovato, 1 = non trovato (non errore)
      return parseRipgrepOutput(out)
    }
  } catch {
    /* ripgrep non disponibile, fallback automatico */
  }

  // Fallback: findstr (Windows nativo)
  return findstrSearch(pattern, caseSensitive)
}

export async function findFunction(name: string): Promise<SearchResult[]> {
  return search(`(function|const|async function)\\s+${name}`, { caseSensitive: true })
}

export async function findImport(moduleName: string): Promise<SearchResult[]> {
  return search(`from ['"].*${moduleName}.*['"]`)
}

function parseRipgrepOutput(raw: string): SearchResult[] {
  return raw.split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        const obj = JSON.parse(line) as {
          type: string
          data?: {
            path?: { text: string }
            line_number?: number
            submatches?: Array<{ start: number }>
            lines?: { text: string }
          }
        }
        if (obj.type !== 'match' || !obj.data) return []
        return [{
          file:   obj.data.path?.text ?? '',
          line:   obj.data.line_number ?? 0,
          column: obj.data.submatches?.[0]?.start ?? 0,
          text:   (obj.data.lines?.text ?? '').trim()
        }]
      } catch {
        return []
      }
    })
}

async function findstrSearch(pattern: string, caseSensitive: boolean): Promise<SearchResult[]> {
  const args = ['findstr', '/S', '/N']
  if (!caseSensitive) args.push('/I')
  // Nota: findstr non supporta bene pattern complessi come rg
  args.push(pattern, join(WORKSPACE, '*.ts'))

  try {
    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe', cwd: WORKSPACE })
    const out  = await new Response(proc.stdout).text()
    return out.split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.split(':')
        const filePart = parts[0]
        const linePart = parts[1]
        const textPart = parts.slice(2).join(':').trim()
        return {
          file:   filePart ?? '',
          line:   parseInt(linePart ?? '0'),
          column: 0,
          text:   textPart
        }
      })
  } catch (err) {
    console.warn('[codeSearch] findstr fallback failed:', err)
    return []
  }
}
