/**
 * src/agent/tools/projectTools.ts
 */
import { mkdir, writeFile, exists } from 'fs/promises'
import { join } from 'path'

export async function createProject(
  name: string,
  basePath: string
): Promise<string> {
  if (!name || !basePath) throw new Error('name e path sono obbligatori')

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64)
  const projectPath = join(basePath, safeName)

  // Nota: exists() in Bun ritorna Promise<boolean>
  if (await exists(projectPath)) {
    return `⚠️ Il progetto "${safeName}" esiste già in ${basePath}`
  }

  await mkdir(join(projectPath, 'src'), { recursive: true })

  await writeFile(join(projectPath, 'package.json'),
    JSON.stringify({
      name: safeName, version: '0.1.0',
      description: `${safeName} — creato da Camelot IDE`,
      main: './src/index.ts',
      scripts: { start: 'bun run src/index.ts', dev: 'bun --watch src/index.ts', test: 'bun test' },
      dependencies: {},
      devDependencies: { '@types/bun': 'latest', 'typescript': 'latest' }
    }, null, 2))

  await writeFile(join(projectPath, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext', module: 'ESNext',
        moduleResolution: 'bundler', strict: true,
        skipLibCheck: true, outDir: './dist'
      },
      include: ['src/**/*']
    }, null, 2))

  await writeFile(join(projectPath, 'src', 'index.ts'),
    `// ${safeName} — entry point\n// Creato da Camelot IDE il ${new Date().toLocaleDateString('it-IT')}\n\nconsole.log('🚀 ${safeName} avviato!')\n`)

  await writeFile(join(projectPath, '.gitignore'),
    'node_modules/\ndist/\n.env\n.env.local\n')

  return `✅ Progetto "${safeName}" creato in ${projectPath}\n` +
         `   📁 src/index.ts\n   📄 package.json\n   ⚙️ tsconfig.json\n   🔒 .gitignore`
}
