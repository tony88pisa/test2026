import { describe, it, expect, spyOn, beforeEach } from 'bun:test';

describe('GET /api/status', () => {
  it('ollama online quando fetch risponde 200', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 200 }))
    );
    
    const { getStatus } = await import('../dashboard/server.js');
    const res = await getStatus();
    const body = await res.json();
    
    expect(body.ollama).toBe(true);
    expect(typeof body.uptime).toBe('number');
    
    fetchSpy.mockRestore();
  });

  it('ollama offline quando fetch lancia', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('conn refused'))
    );
    
    const { getStatus } = await import('../dashboard/server.js');
    const res = await getStatus();
    const body = await res.json();
    
    expect(body.ollama).toBe(false);
    
    fetchSpy.mockRestore();
  });

  it('model è gemma4:latest di default', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 200 }))
    );
    
    const { getStatus } = await import('../dashboard/server.js');
    const res = await getStatus();
    const body = await res.json();
    
    expect(body.model).toBe('gemma4:latest');
    
    fetchSpy.mockRestore();
  });
});

describe('GET /api/memory/sessions', () => {
  it('restituisce array anche se recallMemory è vuoto', async () => {
    const { getSessions } = await import('../dashboard/server.js');
    const res = await getSessions();
    const body = await res.json();
    
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('HTML response', () => {
  it('contiene "Camelot"', async () => {
    const { getDashboardHtml } = await import('../dashboard/server.js');
    expect(getDashboardHtml()).toContain('Camelot');
  });

  it('ha meta viewport (mobile-ready)', async () => {
    const { getDashboardHtml } = await import('../dashboard/server.js');
    expect(getDashboardHtml()).toContain('viewport');
  });

  it('NON contiene "trade" o "freqtrade"', async () => {
    const { getDashboardHtml } = await import('../dashboard/server.js');
    const html = getDashboardHtml().toLowerCase();
    
    expect(html).not.toContain('freqtrade');
    // "trade" può comparire in parole come "upgrade" - cerchiamo la parola esatta \btrade\b
    expect(html.match(/\btrade\b/)).toBeNull();
  });
});
