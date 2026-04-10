// ============================================================
// MODULO: SkillLoader v1.0 — M17
// REGOLA: Unico punto di caricamento skill a runtime.
//         Le skill sono moduli TypeScript/JS in src/skills/bundled/
//         ognuno con un manifest.json.
//         VIETATO importare skill direttamente fuori da qui.
// DIPENDENZE: WorkspaceManager (M1), SSEManager (M2)
// STRUTTURA SKILL:
//   src/skills/bundled/<nome>/
//     manifest.json   — metadati + comandi esposti
//     index.ts        — entry point (export default + named exports)
// ============================================================

import { SSEManager, SSEEventType } from '../server/SSEManager'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

export interface SkillManifest {
  name:        string
  version:     string
  description: string
  author?:     string
  commands:    string[]
  entrypoint:  string           // relativo alla dir della skill
  permissions?: SkillPermission[]
  autoload?:   boolean
}

export type SkillPermission = 'fs:read' | 'fs:write' | 'git' | 'network' | 'terminal'

export interface LoadedSkill {
  manifest:  SkillManifest
  dirPath:   string             // path assoluto della directory skill
  module:    Record<string, (...args: unknown[]) => unknown>
  loadedAt:  number
  callCount: number
}

export class SkillLoader {
  private static instance: SkillLoader
  private skills    = new Map<string, LoadedSkill>()
  private skillsDir: string
  private sse:       SSEManager

  private constructor(skillsDir: string, sse: SSEManager) {
    this.skillsDir = resolve(skillsDir)
    this.sse       = sse
  }

  static getInstance(skillsDir?: string, sse?: SSEManager): SkillLoader {
    if (!SkillLoader.instance) {
      if (!skillsDir || !sse) throw new Error('SkillLoader: prima inizializzazione richiede skillsDir e sse')
      SkillLoader.instance = new SkillLoader(skillsDir, sse)
    }
    return SkillLoader.instance
  }

  // ── Scan: legge manifest da disco, NON carica il modulo ───────────────────
  scanAvailable(): Array<{ manifest: SkillManifest; dirPath: string; loaded: boolean }> {
    if (!existsSync(this.skillsDir)) return []
    const results = []
    for (const entry of readdirSync(this.skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(this.skillsDir, entry.name, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest
        results.push({
          manifest,
          dirPath: join(this.skillsDir, entry.name),
          loaded:  this.skills.has(manifest.name)
        })
      } catch { /* manifest corrotto */ }
    }
    return results
  }

  // ── Load: carica il modulo in memoria ────────────────────────────────
  async load(skillName: string): Promise<LoadedSkill> {
    const available = this.scanAvailable()
    const entry     = available.find(s => s.manifest.name === skillName)
    if (!entry) throw new Error(`Skill "${skillName}" non trovata in ${this.skillsDir}`)

    const entryPath = resolve(entry.dirPath, entry.manifest.entrypoint)
    if (!existsSync(entryPath)) {
      throw new Error(`Entrypoint non trovato: ${entryPath}`)
    }

    // Bun supporta import() dinamico di .ts nativo
    const mod = await import(entryPath) as Record<string, (...args: unknown[]) => unknown>

    // Verifica che i comandi del manifest siano esportati
    for (const cmd of entry.manifest.commands) {
      if (typeof mod[cmd] !== 'function') {
        throw new Error(`Skill "${skillName}": comando "${cmd}" non esportato`)
      }
    }

    const loaded: LoadedSkill = {
      manifest:  entry.manifest,
      dirPath:   entry.dirPath,
      module:    mod,
      loadedAt:  Date.now(),
      callCount: 0
    }
    this.skills.set(skillName, loaded)
    this.sse.emit(SSEEventType.SKILL_LOADED, { name: skillName, version: entry.manifest.version, ts: Date.now() })
    console.log(`[SkillLoader] ✅ Caricata: ${skillName} v${entry.manifest.version}`)
    return loaded
  }

  // ── Unload: rimuove dalla memoria ────────────────────────────────────
  unload(skillName: string): void {
    if (!this.skills.has(skillName)) throw new Error(`Skill "${skillName}" non caricata`)
    this.skills.delete(skillName)
    this.sse.emit(SSEEventType.SKILL_REMOVED, { name: skillName, ts: Date.now() })
    console.log(`[SkillLoader] 🗑️ Rimossa: ${skillName}`)
  }

  // ── Reload: unload + load (hot-reload) ──────────────────────────────
  async reload(skillName: string): Promise<LoadedSkill> {
    if (this.skills.has(skillName)) this.unload(skillName)
    return this.load(skillName)
  }

  // ── Execute: chiama un comando di una skill caricata ───────────────────
  async execute(skillName: string, command: string, args: unknown[] = []): Promise<unknown> {
    const skill = this.skills.get(skillName)
    if (!skill) throw new Error(`Skill "${skillName}" non caricata. Usa load() prima.`)
    if (!skill.manifest.commands.includes(command)) {
      throw new Error(`Comando "${command}" non supportato da "${skillName}"`)
    }
    const fn = skill.module[command]
    if (typeof fn !== 'function') {
      throw new Error(`"${command}" non è una funzione in "${skillName}"`)
    }
    skill.callCount++
    return fn(...args)
  }

  // ── Getters ─────────────────────────────────────────────────────────────
  getLoaded(): LoadedSkill[] { return [...this.skills.values()] }
  get(name: string): LoadedSkill | undefined { return this.skills.get(name) }
  isLoaded(name: string): boolean { return this.skills.has(name) }
  getStats() {
    return [...this.skills.values()].map(s => ({
      name:      s.manifest.name,
      version:   s.manifest.version,
      loadedAt:  s.loadedAt,
      callCount: s.callCount
    }))
  }

  // ── Auto-load tutte le skill con autoload:true nel manifest ────────────
  async autoload(): Promise<string[]> {
    const available = this.scanAvailable()
    const loaded: string[] = []
    for (const entry of available) {
      const manifest = entry.manifest as SkillManifest
      if (manifest.autoload) {
        try {
          await this.load(manifest.name)
          loaded.push(manifest.name)
        } catch (err) {
          console.warn(`[SkillLoader] ⚠️ Autoload fallito per "${manifest.name}": ${err}`)
        }
      }
    }
    return loaded
  }
}
