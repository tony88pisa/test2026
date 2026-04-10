// ============================================================
// MODULO: GitRouter v1.0 — M15
// REGOLA: Tutti i comandi Git passano da qui.
//         Usa Bun.spawn per eseguire git nativo.
//         VIETATO eseguire spawn('git') fuori da questo modulo.
// DIPENDENZE: WorkspaceManager (M1), SSEManager (M2), BunRouter (M6b)
// ENDPOINT:
//   GET  /api/git/status          — git status
//   GET  /api/git/log             — ultimi N commit
//   GET  /api/git/branches        — lista branch
//   GET  /api/git/diff            — diff staged/unstaged
//   POST /api/git/add             — git add <paths[]>
//   POST /api/git/commit          — git commit -m
//   POST /api/git/push            — git push
//   POST /api/git/pull            — git pull
//   POST /api/git/branch/create   — crea nuovo branch
//   POST /api/git/branch/checkout — cambia branch
//   POST /api/git/stash           — git stash / pop
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import { BunRouter } from '../BunRouter'
import { SSEManager, SSEEventType } from '../SSEManager'
import { WorkspaceManager } from '../WorkspaceManager'

export function createGitRouter(
  workspace: WorkspaceManager,
  sse: SSEManager
): BunRouter {
  const router = new BunRouter()
  const cwd = workspace.getRootPath()

  // ── GET /api/git/status ────────────────────────────────────────────────
  router.get('/status', async () => {
    try {
      const raw = await git(cwd, ['status', '--porcelain=v1', '-b'])
      const lines = raw.split('\n').filter(Boolean)
      const branch = lines[0]?.replace('## ', '').split('...')[0] ?? 'unknown'
      const files = lines.slice(1).map(line => ({
        status: line.slice(0, 2).trim(),
        path:   line.slice(3)
      }))
      const clean = files.length === 0
      return Response.json({ branch, clean, files, count: files.length })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── GET /api/git/log?n=20 ─────────────────────────────────────────────
  router.get('/log', async (req) => {
    try {
      const url = new URL(req.url)
      const n   = parseInt(url.searchParams.get('n') ?? '20')
      const fmt = '%H %an %ae %ai %s'
      const raw = await git(cwd, ['log', `--max-count=${n}`, `--pretty=format:${fmt}`])
      const commits = raw.split('\n').filter(Boolean).map(line => {
        const parts = line.split(' ')
        const sha = parts[0]
        const author = parts[1]
        const email = parts[2]
        const date = parts[3]
        const subject = parts.slice(4).join(' ')
        return { sha, author, email, date, subject }
      })
      return Response.json({ commits, count: commits.length })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── GET /api/git/branches ─────────────────────────────────────────────
  router.get('/branches', async () => {
    try {
      const raw = await git(cwd, ['branch', '-a', '--format=%(refname:short)|%(HEAD)'])
      const branches = raw.split('\n').filter(Boolean).map(line => {
        const [name, current] = line.split('|')
        return { name, current: current === '*' }
      })
      const current = branches.find(b => b.current)?.name ?? 'unknown'
      return Response.json({ branches, current })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── GET /api/git/diff?staged=true ─────────────────────────────────────
  router.get('/diff', async (req) => {
    try {
      const url    = new URL(req.url)
      const staged = url.searchParams.get('staged') === 'true'
      const file   = url.searchParams.get('file') ?? ''
      const args   = ['diff']
      if (staged) args.push('--staged')
      if (file)   args.push('--', file)
      const diff = await git(cwd, args)
      return Response.json({ diff, staged, file: file || null })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/add ──────────────────────────────────────────────────
  router.post('/add', async (req) => {
    try {
      const { paths = ['.'] } = await req.json() as { paths?: string[] }
      await git(cwd, ['add', ...paths])
      const status = await git(cwd, ['status', '--porcelain=v1'])
      sse.emit(SSEEventType.GIT_CHANGED, { action: 'add', paths, ts: Date.now() })
      return Response.json({ ok: true, paths, stagedCount: status.split('\n').filter(l => l.match(/^[AMDRC]/)).length })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/commit ──────────────────────────────────────────────
  router.post('/commit', async (req) => {
    try {
      const { message, addAll = false } = await req.json() as { message: string; addAll?: boolean }
      if (!message?.trim()) {
        return Response.json({ error: '"message" richiesto' }, { status: 400 })
      }
      if (addAll) await git(cwd, ['add', '.'])
      const result = await git(cwd, ['commit', '-m', message])
      const sha    = await git(cwd, ['rev-parse', '--short', 'HEAD'])
      sse.emit(SSEEventType.GIT_COMMITTED, { message, sha: sha.trim(), ts: Date.now() })
      return Response.json({ ok: true, message, sha: sha.trim(), output: result })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/push ─────────────────────────────────────────────────
  router.post('/push', async (req) => {
    try {
      const { remote = 'origin', branch = '' } = await req.json() as { remote?: string; branch?: string }
      const args = ['push', remote]
      if (branch) args.push(branch)
      const result = await git(cwd, args)
      sse.emit(SSEEventType.GIT_PUSHED, { remote, branch: branch || 'current', ts: Date.now() })
      return Response.json({ ok: true, remote, output: result })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/pull ─────────────────────────────────────────────────
  router.post('/pull', async (req) => {
    try {
      const { remote = 'origin', branch = '' } = await req.json() as { remote?: string; branch?: string }
      const args = ['pull', remote]
      if (branch) args.push(branch)
      const result = await git(cwd, args)
      sse.emit(SSEEventType.GIT_CHANGED, { action: 'pull', remote, ts: Date.now() })
      return Response.json({ ok: true, remote, output: result })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/branch/create ─────────────────────────────────────────
  router.post('/branch/create', async (req) => {
    try {
      const { name, checkout = true } = await req.json() as { name: string; checkout?: boolean }
      if (!name?.trim()) {
        return Response.json({ error: '"name" richiesto' }, { status: 400 })
      }
      if (checkout) {
        await git(cwd, ['checkout', '-b', name])
      } else {
        await git(cwd, ['branch', name])
      }
      sse.emit(SSEEventType.GIT_CHANGED, { action: 'branch-create', name, ts: Date.now() })
      return Response.json({ ok: true, branch: name, checkedOut: checkout })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/branch/checkout ──────────────────────────────────────
  router.post('/branch/checkout', async (req) => {
    try {
      const { name } = await req.json() as { name: string }
      if (!name?.trim()) {
        return Response.json({ error: '"name" richiesto' }, { status: 400 })
      }
      await git(cwd, ['checkout', name])
      sse.emit(SSEEventType.GIT_CHANGED, { action: 'checkout', branch: name, ts: Date.now() })
      return Response.json({ ok: true, branch: name })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  // ── POST /api/git/stash ───────────────────────────────────────────────
  router.post('/stash', async (req) => {
    try {
      const { action = 'push', message = '' } = await req.json() as { action?: 'push' | 'pop' | 'list'; message?: string }
      let args: string[]
      if (action === 'push') {
        args = ['stash', 'push']
        if (message) args.push('-m', message)
      } else if (action === 'pop') {
        args = ['stash', 'pop']
      } else {
        args = ['stash', 'list']
      }
      const result = await git(cwd, args)
      return Response.json({ ok: true, action, output: result })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  })

  return router
}

// ─── Helper: esegui git con Bun.spawn ─────────────────────────────────────────

async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) {
    throw new Error(err.trim() || `git ${args[0]} exit ${code}`)
  }
  return out.trim()
}
