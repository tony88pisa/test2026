// ============================================================
// MODULO: RemoteManager v1.0 — Modulo M19
// REGOLA: Gestisce il tunnel Cloudflare per l'accesso remoto.
//         Cattura l'URL pubblico e lo notifica via SSE.
// ============================================================

import { SSEManager, SSEEventType } from '../server/SSEManager'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

export class RemoteManager {
  private static instance: RemoteManager
  private publicUrl: string | null = null
  private process: any = null

  static getInstance(): RemoteManager {
    if (!RemoteManager.instance) RemoteManager.instance = new RemoteManager()
    return RemoteManager.instance
  }

  private emitUrl() {
    if (this.publicUrl) {
      SSEManager.getInstance().emit(SSEEventType.REMOTE_URL, { 
        url: this.publicUrl,
        mode: 'cloudflare',
        ts: Date.now()
      })
    }
  }

  /** Restituisce l'URL pubblico se disponibile */
  getPublicUrl(): string | null {
    return this.publicUrl
  }

  /**
   * Avvia il tunnel Cloudflare in modo indipedente.
   * NON blocca il boot del server.
   */
  async start(): Promise<void> {
    console.log('[RemoteManager] Tentativo di avvio tunnel...')
    const urlFilePath = join(process.cwd(), '.cloudflared_url')

    // 0. Verifica se cloudflared è in esecuzione (Detached Check)
    try {
      const ps = Bun.spawnSync(['powershell', '-NoProfile', '-Command', 'Get-Process cloudflared -ErrorAction SilentlyContinue'])
      if (ps.exitCode === 0) {
        try {
          const savedUrl = readFileSync(urlFilePath, 'utf-8').trim()
          if (savedUrl.startsWith('https://')) {
            this.publicUrl = savedUrl
            console.log(`[RemoteManager] 🌐 Tunnel già attivo (Detached): ${this.publicUrl}`)
            this.emitUrl()
            return
          }
        } catch {}
        // Processo attivo ma URL perso, forziamo il riavvio
        console.log('[RemoteManager] Tunnel pendente senza URL, chiusura forzata.')
        Bun.spawnSync(['powershell', '-Command', 'Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue'])
      }
    } catch {}

    // 1. Verifica se cloudflared è installato
    try {
      const check = Bun.spawnSync(['cloudflared', '--version'])
      if (check.exitCode !== 0) throw new Error('cloudflared non trovato')
    } catch (err) {
      console.warn('[RemoteManager] ⚠️ cloudflared non rilevato nel PATH. Funzionalità remota disabilitata.')
      return
    }

    // 2. Lancio del tunnel verso il server locale come processo INDIPENDENTE
    try {
      // Usiamo node:child_process per usare detached e unref
      this.process = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3001'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.process.unref() // Lascia che il processo sopravviva al server

      // 3. Monitoraggio dei log per estrarre l'URL pubblico
      this.monitorStreamNode(this.process.stderr)
      this.monitorStreamNode(this.process.stdout)
      
    } catch (err) {
      console.error('[RemoteManager] ❌ Errore durante il lancio di cloudflared:', err)
    }
  }

  // Monitoraggio per streams node:child_process
  private monitorStreamNode(stream: any) {
    if (!stream) return
    const regex  = /https:\/\/[a-z0-9\-]+\.trycloudflare\.com/

    stream.on('data', (data: Buffer) => {
      const line = data.toString()
      const match = line.match(regex)
      if (match && match[0] !== this.publicUrl) {
        this.publicUrl = match[0]
        console.log(`[RemoteManager] 🌐 NUOVO URL PUBBLICO DISPONIBILE: ${this.publicUrl}`)
        try { writeFileSync(join(process.cwd(), '.cloudflared_url'), this.publicUrl) } catch {}
        this.emitUrl()
      }
    })
  }

  /** Ferma il tunnel */
  stop() {
    if (this.process) {
      console.log('[RemoteManager] Chiusura tunnel...')
      this.process.kill()
      this.process = null
      this.publicUrl = null
    }
  }
}
