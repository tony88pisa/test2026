// ============================================================
// MODULO: EmberWorkspaceContext v1.0
// REGOLA: Ember legge il workspace SOLO tramite questo modulo.
//         buildWorkspaceContext() va iniettato nel system prompt.
//         getFileContext() va usato quando Ember apre un file.
// DIPENDENZE: WorkspaceRoutes (M3) — richiede server attivo
// DEPRECA: prompt generico senza contesto workspace
// SYNC: aggiornare buddy/prompt.ts per chiamare buildWorkspaceContext()
// ============================================================

export interface WorkspaceTree {
  root: string
  tree: FileNode[]
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  ext?: string
  children?: FileNode[]
}

const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}/api/workspace`
  : 'http://localhost:3001/api/workspace'

/** Costruisce il contesto workspace per il system prompt di Ember */
export async function buildWorkspaceContext(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/tree`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { tree, root } = await res.json() as WorkspaceTree

    const fileCount = countFiles(tree)
    const treeStr = renderTree(tree, '', 0, 3) // max 3 livelli nel prompt

    return [
      '## 📁 Workspace Attivo',
      `**Root**: \`${root}\``,
      `**File**: ${fileCount} file indicizzati`,
      '',
      '### Struttura',
      '```',
      treeStr,
      '```',
      '',
      '> Puoi leggere file con `GET /api/workspace/file?path=<percorso>`',
      '> Puoi modificare file con `POST /api/workspace/file { path, content }`',
    ].join('\n')
  } catch (err) {
    return [
      '## Workspace',
      `> ⚠️ Non disponibile: ${err}`,
      '> Assicurati che il server sia avviato su porta 3001.',
    ].join('\n')
  }
}

/** Recupera il contenuto di un file specifico */
export async function getFileContext(filePath: string): Promise<{ content: string; path: string }> {
  const res = await fetch(`${API_BASE}/file?path=${encodeURIComponent(filePath)}`)
  if (!res.ok) throw new Error(`File non trovato: ${filePath} (HTTP ${res.status})`)
  return res.json() as Promise<{ content: string; path: string }>
}

/** Salva un file tramite API */
export async function saveFile(filePath: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content })
  })
  if (!res.ok) throw new Error(`Errore salvataggio: HTTP ${res.status}`)
}

function renderTree(nodes: FileNode[], prefix: string, depth: number, maxDepth: number): string {
  if (depth >= maxDepth) return `${prefix}...`
  return nodes.map((node, i) => {
    const isLast = i === nodes.length - 1
    const connector = isLast ? '└── ' : '├── '
    const childPrefix = prefix + (isLast ? '    ' : '│   ')
    const icon = node.type === 'dir' ? '📁' : getFileIcon(node.ext)
    let line = `${prefix}${connector}${icon} ${node.name}`
    if (node.children?.length) {
      line += '\n' + renderTree(node.children, childPrefix, depth + 1, maxDepth)
    }
    return line
  }).join('\n')
}

function getFileIcon(ext?: string): string {
  const icons: Record<string, string> = {
    ts: '📘', tsx: '⚛️', js: '📙', jsx: '⚛️',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    py: '🐍', sh: '⚙️', env: '🔒', sql: '🗃️'
  }
  return icons[ext ?? ''] ?? '📄'
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((acc, node) => {
    if (node.type === 'file') return acc + 1
    return acc + countFiles(node.children ?? [])
  }, 0)
}
