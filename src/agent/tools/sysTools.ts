/**
 * src/agent/tools/sysTools.ts
 */
import { readFile, writeFile, access } from 'fs/promises'
import { dirname } from 'path'
import { mkdir } from 'fs/promises'

const COMMAND_WHITELIST = [
  'bun', 'git', 'mkdir', 'ls', 'dir', 'cat',
  'node', 'npx', 'bunx', 'echo', 'pwd', 'type'
]

function isCommandSafe(command: string): boolean {
  const base = command.trim().split(/\s+/)[0].toLowerCase()
  const BLOCKED = ['rm', 'del', 'format', 'fdisk', 'sudo',
                   'shutdown', 'reboot', 'kill', 'taskkill',
                   'reg', 'regedit', 'netsh', 'powershell', 'cmd']
  if (BLOCKED.some(b => base.includes(b))) return false
  return COMMAND_WHITELIST.some(w => base === w || base.endsWith('\\' + w))
}

export async function runCommand(command: string, cwd?: string): Promise<string> {
  if (!isCommandSafe(command)) {
    return `🚫 Comando non consentito: "${command.split(' ')[0]}"\nWhitelist: ${COMMAND_WHITELIST.join(', ')}`
  }
  const parts = command.trim().split(/\s+/)
  const proc = Bun.spawn({ cmd: parts, cwd: cwd ?? process.cwd(), stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  const out = stdout.trim()
  const err = stderr.trim()
  if (proc.exitCode !== 0 && err) return `❌ Exit ${proc.exitCode}:\n${err}`
  return out || '✅ Completato (nessun output)'
}

export async function writeFileTool(filePath: string, content: string): Promise<string> {
  const BLOCKED_PATHS = ['C:\\Windows', 'C:\\System32', '/etc/', '/usr/', '/bin/']
  if (BLOCKED_PATHS.some(p => filePath.startsWith(p))) {
    return `🚫 Path di sistema non modificabile: ${filePath}`
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
  return `✅ File scritto: ${filePath} (${content.length} caratteri)`
}

export async function readFileTool(filePath: string): Promise<string> {
  try {
    await access(filePath)
    const content = await readFile(filePath, 'utf-8')
    return content.slice(0, 8000)
  } catch {
    return `❌ File non trovato o non leggibile: ${filePath}`
  }
}
