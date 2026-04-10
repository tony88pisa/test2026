/**
 * src/voice/voiceAdapter.ts
 *
 * Base structure for voice-to-text control.
 */

export interface VoiceCommand {
  transcript: string
  confidence: number
  timestamp: number
}

export interface VoiceAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  onCommand(handler: (cmd: VoiceCommand) => void): void
  transcribe(audioData: ArrayBuffer): Promise<string>
}

/**
 * LocalVoiceStub: Minimal implementation that doesn't require extra processes.
 * Useful for development and testing.
 */
export class LocalVoiceStub implements VoiceAdapter {
  private handler?: (cmd: VoiceCommand) => void

  async start(): Promise<void> {
    console.log('[voice] 🎙️ LocalVoiceStub pronto (stub mode)')
  }

  async stop(): Promise<void> {
    console.log('[voice] 🎙️ LocalVoiceStub fermato')
  }

  onCommand(handler: (cmd: VoiceCommand) => void): void {
    this.handler = handler
  }

  async transcribe(_audioData: ArrayBuffer): Promise<string> {
    return "" // Stub non trascrive audio reale
  }

  /**
   * For testing: manually inject a voice command.
   */
  simulateCommand(transcript: string): void {
    if (this.handler) {
      this.handler({
        transcript,
        confidence: 1.0,
        timestamp: Date.now()
      })
    }
  }
}

/**
 * Factory that returns the best available voice adapter.
 * Looks for WHISPER_URL in environment.
 */
export async function createVoiceAdapter(): Promise<VoiceAdapter> {
  const whisperUrl = process.env.WHISPER_URL
  if (whisperUrl) {
    // Dynamic import to avoid loading redundant dependencies if Whisper is off
    const { WhisperAdapter } = await import('./whisperAdapter.js')
    console.log('[voice] 🛰️ Usando WhisperAdapter:', whisperUrl)
    const adapter = new WhisperAdapter(whisperUrl)
    await adapter.start()
    return adapter
  }
  
  console.log('[voice] 🎙️ Usando LocalVoiceStub (WHISPER_URL non impostato)')
  const stub = new LocalVoiceStub()
  await stub.start()
  return stub
}
