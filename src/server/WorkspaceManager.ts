// ============================================================
// MODULO: WorkspaceManager v1.0
// REGOLA: Unico punto di accesso al filesystem del workspace.
//         VIETATO usare fs.readFileSync/writeFileSync direttamente altrove.
// DIPENDENZE: nessuna (modulo base)
// DEPRECA: qualsiasi accesso fs diretto nel backend
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import fs from 'fs'
import path from 'path'

export interface FileNode {
  name: string
  path: string          // relativa alla root del workspace
  type: 'file' | 'dir'
  size?: number
  ext?: string
  children?: FileNode[]
}

export interface WorkspaceChangeEvent {
  type: 'add' | 'change' | 'remove'
  path: string
  timestamp: number
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', 'build',
  '__pycache__', '.venv', 'venv', '.cache', 'coverage',
  '.turbo', '.svelte-kit', 'out'
])

export class WorkspaceManager {
  private static instance: WorkspaceManager
  private rootPath: string
  private watchers: Set<(event: WorkspaceChangeEvent) => void> = new Set()
  private watchTimer: Timer | null = null
  private lastSnapshot: Map<string, number> = new Map()

  private constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath)
    this.startPollingWatcher()
  }

  static getInstance(rootPath?: string): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      if (!rootPath) throw new Error('WorkspaceManager: rootPath richiesto al primo init')
      WorkspaceManager.instance = new WorkspaceManager(rootPath)
    }
    return WorkspaceManager.instance
  }

  /** Restituisce l'albero file del workspace */
  getTree(depth = 5, dir = this.rootPath, currentDepth = 0): FileNode[] {
    if (currentDepth >= depth) return []
    try {
      return fs.readdirSync(dir)
        .filter(name => !IGNORED_DIRS.has(name) && !name.startsWith('.'))
        .map(name => {
          const fullPath = path.join(dir, name)
          let stat: fs.Stats
          try { stat = fs.statSync(fullPath) } catch { return null }
          const relativePath = path.relative(this.rootPath, fullPath).replace(/\\/g, '/')
          const node: FileNode = {
            name,
            path: relativePath,
            type: stat.isDirectory() ? 'dir' : 'file',
            size: stat.isDirectory() ? undefined : stat.size,
            ext: stat.isDirectory() ? undefined : path.extname(name).slice(1)
          }
          if (stat.isDirectory()) {
            node.children = this.getTree(depth, fullPath, currentDepth + 1)
          }
          return node
        })
        .filter((n): n is FileNode => n !== null)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  }

  /** Legge un file (path relativa al workspace) */
  getFile(relativePath: string): string {
    return fs.readFileSync(this.resolvePath(relativePath), 'utf8')
  }

  /** Scrive un file (crea directory se necessario) */
  writeFile(relativePath: string, content: string): void {
    const fullPath = this.resolvePath(relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf8')
  }

  /** Elimina un file */
  deleteFile(relativePath: string): void {
    const fullPath = this.resolvePath(relativePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  }

  /** Risolve path relativa → assoluta con protezione path-traversal */
  resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.rootPath, relativePath)
    if (!resolved.startsWith(this.rootPath)) {
      throw new Error(`WorkspaceManager: path traversal bloccato: ${relativePath}`)
    }
    return resolved
  }

  getRootPath(): string { return this.rootPath }

  /** Registra un callback per i cambiamenti file */
  onChanged(cb: (event: WorkspaceChangeEvent) => void): () => void {
    this.watchers.add(cb)
    return () => this.watchers.delete(cb)
  }

  /** Polling watcher (compatibile Bun senza chokidar) */
  private startPollingWatcher(intervalMs = 2000): void {
    // Snapshot iniziale
    this.buildSnapshot(this.rootPath, this.lastSnapshot)

    this.watchTimer = setInterval(() => {
      const newSnapshot: Map<string, number> = new Map()
      this.buildSnapshot(this.rootPath, newSnapshot)

      // Trova aggiunte e modifiche
      for (const [filePath, mtime] of newSnapshot) {
        if (!this.lastSnapshot.has(filePath)) {
          this.emit({ type: 'add', path: filePath, timestamp: mtime })
        } else if (this.lastSnapshot.get(filePath) !== mtime) {
          this.emit({ type: 'change', path: filePath, timestamp: mtime })
        }
      }
      // Trova rimozioni
      for (const filePath of this.lastSnapshot.keys()) {
        if (!newSnapshot.has(filePath)) {
          this.emit({ type: 'remove', path: filePath, timestamp: Date.now() })
        }
      }
      this.lastSnapshot = newSnapshot
    }, intervalMs)
  }

  private buildSnapshot(dir: string, map: Map<string, number>, depth = 0): void {
    if (depth > 5) return
    try {
      for (const name of fs.readdirSync(dir)) {
        if (IGNORED_DIRS.has(name) || name.startsWith('.')) continue
        const full = path.join(dir, name)
        const rel = path.relative(this.rootPath, full).replace(/\\/g, '/')
        try {
          const stat = fs.statSync(full)
          if (stat.isDirectory()) this.buildSnapshot(full, map, depth + 1)
          else map.set(rel, stat.mtimeMs)
        } catch { /* file locked o rimosso durante scan */ }
      }
    } catch { /* directory rimossa */ }
  }

  private emit(event: WorkspaceChangeEvent): void {
    for (const cb of this.watchers) cb(event)
  }

  destroy(): void {
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.watchers.clear()
  }
}
