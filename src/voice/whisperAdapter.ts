/**
 * src/voice/whisperAdapter.ts
 *
 * Whisper implementation for voice control via Ollama/Whisper backend.
 */

import { VoiceAdapter, VoiceCommand } from './voiceAdapter.js'

export class WhisperAdapter implements VoiceAdapter {
  private handler?: (cmd: VoiceCommand) => void
  private running = false
  private whisperUrl: string

  constructor(whisperUrl: string) {
    this.whisperUrl = whisperUrl
  }

  async start(): Promise<void> {
    this.running = true
    console.log('[voice] 🎙️ WhisperAdapter avviato →', this.whisperUrl)
  }

  async stop(): Promise<void> {
    this.running = false
    console.log('[voice] 🎙️ WhisperAdapter fermato')
  }

  onCommand(handler: (cmd: VoiceCommand) => void): void {
    this.handler = handler
  }

  /**
   * Transcribes an audio Buffer/Blob via Whisper remote endpoint.
   */
  async transcribe(audioData: ArrayBuffer): Promise<string> {
    if (!this.running) return ''
    
    try {
      const res = await fetch(this.whisperUrl + '/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: audioData,
        signal: AbortSignal.timeout(30_000)
      })
      
      if (!res.ok) throw new Error('HTTP ' + res.status)
      
      const json = await res.json() as { text: string }
      return json.text?.trim() ?? ''
    } catch (e) {
      console.warn('[voice] ❌ transcribe fallito:', e)
      return ''
    }
  }

  /**
   * Processes raw audio data, transcribes it, and triggers the command handler.
   */
  async processAudio(audioData: ArrayBuffer): Promise<void> {
    const text = await this.transcribe(audioData)
    if (text && this.handler) {
      this.handler({
        transcript: text,
        confidence: 0.95,
        timestamp: Date.now()
      })
    }
  }
}
