/**
 * src/agent/toolRegistry.ts
 */

export interface ToolSchema {
  name:        string
  description: string
  parameters: {
    type:       'object'
    properties: Record<string, { type: string; description: string }>
    required:   string[]
  }
}

export interface ToolResult {
  tool:     string
  args:     Record<string, unknown>
  output:   string
  success:  boolean
  duration: number
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'search_web',
    description: 'Cerca informazioni su internet usando DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La query di ricerca' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_page',
    description: 'Legge e estrae il testo da una URL specifica.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL da leggere (deve iniziare con http)' }
      },
      required: ['url']
    }
  },
  {
    name: 'recall_memory',
    description: 'Cerca nelle sessioni e ricerche passate salvate in memoria.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cosa cercare nella memoria' }
      },
      required: ['query']
    }
  },
  {
    name: 'create_project',
    description: 'Crea un nuovo progetto con package.json, tsconfig.json e src/index.ts.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome del progetto' },
        path: { type: 'string', description: 'Percorso base dove creare il progetto (es. H:\\)' }
      },
      required: ['name', 'path']
    }
  },
  {
    name: 'write_file',
    description: 'Scrive o sovrascrive un file con il contenuto specificato.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Percorso assoluto del file' },
        content: { type: 'string', description: 'Contenuto da scrivere' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Legge il contenuto di un file locale.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Percorso assoluto del file' }
      },
      required: ['path']
    }
  },
  {
    name: 'run_command',
    description: 'Esegue un comando nella whitelist (bun, git, mkdir, ls, cat, node).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando da eseguire' },
        cwd:     { type: 'string', description: 'Directory di lavoro (opzionale)' }
      },
      required: ['command']
    }
  },
  {
    name: 'explain_code',
    description: 'Spiega un blocco di codice usando il modello AI locale.',
    parameters: {
      type: 'object',
      properties: {
        code:     { type: 'string', description: 'Codice da spiegare' },
        language: { type: 'string', description: 'Linguaggio (es. typescript, python)' }
      },
      required: ['code']
    }
  }
]

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const start = Date.now()
  let output = ''
  let success = false

  try {
    switch (name) {
      case 'search_web': {
        const { searchWebSkill } = await import('../skills/builtin/searchWeb.js')
        const result = await searchWebSkill.run({
            messages: [{ role: 'user', content: String(args.query ?? '') }],
            args: {},
            workspacePath: process.cwd()
        })
        output = result.content
        break
      }
      case 'read_page': {
        const { readPageSkill } = await import('../skills/builtin/searchWeb.js')
        const result = await readPageSkill.run({
            messages: [{ role: 'user', content: String(args.url ?? '') }],
            args: {},
            workspacePath: process.cwd()
        })
        output = result.content
        break
      }
      case 'recall_memory': {
        const { recallMemory } = await import('../memory/sessionContext.js')
        const entries = await recallMemory(String(args.query ?? ''))
        output = entries.length
          ? entries.slice(0,3).map(e => JSON.stringify(e)).join('\n')
          : 'Nessuna memoria trovata per questa query.'
        break
      }
      case 'create_project': {
        const { createProject } = await import('./tools/projectTools.js')
        output = await createProject(String(args.name ?? ''), String(args.path ?? ''))
        break
      }
      case 'write_file': {
        const { writeFileTool } = await import('./tools/sysTools.js')
        output = await writeFileTool(String(args.path ?? ''), String(args.content ?? ''))
        break
      }
      case 'read_file': {
        const { readFileTool } = await import('./tools/sysTools.js')
        output = await readFileTool(String(args.path ?? ''))
        break
      }
      case 'run_command': {
        const { runCommand } = await import('./tools/sysTools.js')
        output = await runCommand(
          String(args.command ?? ''),
          args.cwd ? String(args.cwd) : undefined
        )
        break
      }
      case 'explain_code': {
        const { explainCodeSkill } = await import('../skills/builtin/explainCode.js')
        const result = await explainCodeSkill.run({
            messages: [{ role: 'user', content: String(args.code ?? '') }],
            args: { language: String(args.language ?? 'typescript') },
            workspacePath: process.cwd()
        })
        output = result.content
        break
      }
      default:
        output = `Tool sconosciuto: ${name}`
    }
    success = true
  } catch (e) {
    output = `Errore in ${name}: ${e instanceof Error ? e.message : String(e)}`
    success = false
  }

  return { tool: name, args, output, success, duration: Date.now() - start }
}
