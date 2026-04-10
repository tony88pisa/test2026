import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { authMiddleware, rateLimit } from '../dashboard/server.js'

describe('authMiddleware', () => {
  const origToken = process.env.CAMELOT_AUTH_TOKEN

  beforeEach(() => { delete process.env.CAMELOT_AUTH_TOKEN })
  afterEach(() => {
    if (origToken) process.env.CAMELOT_AUTH_TOKEN = origToken
    else delete process.env.CAMELOT_AUTH_TOKEN
  })

  it('pass-through se CAMELOT_AUTH_TOKEN non impostato', () => {
    const req = new Request('http://localhost:3001/')
    expect(authMiddleware(req)).toBeNull()
  })

  it('/api/status è pubblico anche con token impostato', () => {
    process.env.CAMELOT_AUTH_TOKEN = 'secret123'
    const req = new Request('http://localhost:3001/api/status')
    expect(authMiddleware(req)).toBeNull()
  })

  it('401 se token mancante su rotta protetta', () => {
    process.env.CAMELOT_AUTH_TOKEN = 'secret123'
    const req = new Request('http://localhost:3001/api/memory/sessions')
    const res = authMiddleware(req)
    expect(res?.status).toBe(401)
  })

  it('pass-through con token corretto', () => {
    process.env.CAMELOT_AUTH_TOKEN = 'secret123'
    const req = new Request('http://localhost:3001/api/memory/sessions', {
      headers: { Authorization: 'Bearer secret123' }
    })
    expect(authMiddleware(req)).toBeNull()
  })

  it('401 con token errato', () => {
    process.env.CAMELOT_AUTH_TOKEN = 'secret123'
    const req = new Request('http://localhost:3001/api/memory/sessions', {
      headers: { Authorization: 'Bearer wrong' }
    })
    const res = authMiddleware(req)
    expect(res?.status).toBe(401)
  })
})

describe('rateLimit', () => {
  it('non limita le route HTML /', () => {
    const req = new Request('http://localhost:3001/')
    expect(rateLimit(req)).toBeNull()
  })

  it('permette 60 richieste al minuto', () => {
    // Usa IP unico per evitare flakiness con test paralleli
    const testIp = 'ip-60-' + Math.random();
    for (let i = 0; i < 60; i++) {
        const req = new Request('http://localhost:3001/api/status', {
        headers: { 'x-forwarded-for': testIp }
        })
        expect(rateLimit(req)).toBeNull()
    }
  })

  it('blocca la 61a richiesta (429)', () => {
    const testIp = 'ip-61-' + Math.random();
    for (let i = 0; i < 60; i++) {
        const req = new Request('http://localhost:3001/api/status', {
        headers: { 'x-forwarded-for': testIp }
        })
        rateLimit(req)
    }
    const req = new Request('http://localhost:3001/api/status', {
        headers: { 'x-forwarded-for': testIp }
    })
    expect(rateLimit(req)?.status).toBe(429)
  })
})
