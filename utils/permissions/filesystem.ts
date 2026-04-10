/**
 * filesystem.ts (STUB)
 */
import path from 'path'

export function getSessionMemoryPath(): string {
  return path.join(process.cwd(), '.camelot', 'memory.json')
}
