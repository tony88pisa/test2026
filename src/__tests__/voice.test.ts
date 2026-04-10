import { describe, it, expect, mock, afterEach } from 'bun:test'
import { LocalVoiceStub, createVoiceAdapter } from '../voice/voiceAdapter.js'
import { WhisperAdapter } from '../voice/whisperAdapter.js'

describe('LocalVoiceStub', () => {
  it('start() e stop() senza errori', async () => {
    const stub = new LocalVoiceStub()
    await expect(stub.start()).resolves.toBeUndefined()
    await expect(stub.stop()).resolves.toBeUndefined()
  })

  it('simulateCommand() chiama il handler', () => {
    const stub = new LocalVoiceStub()
    const received: string[] = []
    stub.onCommand(cmd => received.push(cmd.transcript))
    stub.simulateCommand('explain questo codice')
    expect(received).toContain('explain questo codice')
  })

  it('handler non chiamato senza onCommand()', () => {
    const stub = new LocalVoiceStub()
    expect(() => stub.simulateCommand('test')).not.toThrow()
  })
})

describe('WhisperAdapter', () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
  })

  it('transcribe ritorna stringa vuota se fetch fallisce', async () => {
    global.fetch = mock(() => Promise.reject(new Error('connection refused'))) as any
    const adapter = new WhisperAdapter('http://localhost:9999')
    await adapter.start()
    const result = await adapter.transcribe(new ArrayBuffer(0))
    expect(result).toBe('')
  })

  it('processAudio non chiama handler se transcribe è vuoto', async () => {
    global.fetch = mock(() => Promise.reject(new Error())) as any
    const adapter = new WhisperAdapter('http://localhost:9999')
    await adapter.start()
    const called: boolean[] = []
    adapter.onCommand(() => called.push(true))
    await adapter.processAudio(new ArrayBuffer(0))
    expect(called.length).toBe(0)
  })

  it('processAudio chiama handler se transcribe ha testo', async () => {
    global.fetch = mock(() => Promise.resolve(
      new Response(JSON.stringify({ text: 'explain codice' }), { status: 200 })
    )) as any
    const adapter = new WhisperAdapter('http://localhost:9999')
    await adapter.start()
    const cmds: string[] = []
    adapter.onCommand(cmd => cmds.push(cmd.transcript))
    await adapter.processAudio(new ArrayBuffer(8))
    expect(cmds).toContain('explain codice')
  })
})

describe('createVoiceAdapter', () => {
  const origWhisperUrl = process.env.WHISPER_URL

  afterEach(() => {
    if (origWhisperUrl) process.env.WHISPER_URL = origWhisperUrl
    else delete process.env.WHISPER_URL
  })

  it('ritorna LocalVoiceStub se WHISPER_URL assente', async () => {
    delete process.env.WHISPER_URL
    const adapter = await createVoiceAdapter()
    expect(adapter).toBeInstanceOf(LocalVoiceStub)
  })

  it('ritorna WhisperAdapter se WHISPER_URL presente', async () => {
    process.env.WHISPER_URL = 'http://localhost:9999'
    const adapter = await createVoiceAdapter()
    expect(adapter).toBeInstanceOf(WhisperAdapter)
  })
})
