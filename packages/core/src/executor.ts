// packages/core/src/executor.ts
// Bash-like parser & executor — the hardest and most important layer.
// Commands are functions, not shell processes. Pipes are function composition.

import type { Workspace, CommandContext, ExecuteResult } from './workspace'

/**
 * A parsed command stage in a pipeline.
 */
interface ParsedCommand {
  name: string
  args: string[]
  stdin?: Buffer
}

/**
 * A complete pipeline: one or more commands connected by pipes,
 * with optional output redirection.
 */
interface Pipeline {
  stages: ParsedCommand[]
  /** Output file path for `>` redirection */
  outputPath?: string
  /** Append file path for `>>` redirection */
  appendPath?: string
}

/**
 * Handler signature for built-in and custom commands.
 */
export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<Buffer | string>

/**
 * The Executor parses bash-like command strings and runs them in-process.
 * No child processes, no /bin/bash, no exec(). Everything is a TypeScript function.
 */
export class Executor {
  private commands: Map<string, CommandHandler> = new Map()
  private workspace: Workspace

  constructor(workspace: Workspace) {
    this.workspace = workspace
    this.registerBuiltins()
  }

  /** Register all 13 built-in commands */
  private registerBuiltins(): void {
    this.commands.set('cat', this.builtinCat.bind(this))
    this.commands.set('ls', this.builtinLs.bind(this))
    this.commands.set('echo', this.builtinEcho.bind(this))
    this.commands.set('cp', this.builtinCp.bind(this))
    this.commands.set('mv', this.builtinMv.bind(this))
    this.commands.set('rm', this.builtinRm.bind(this))
    this.commands.set('grep', this.builtinGrep.bind(this))
    this.commands.set('wc', this.builtinWc.bind(this))
    this.commands.set('head', this.builtinHead.bind(this))
    this.commands.set('tail', this.builtinTail.bind(this))
    this.commands.set('find', this.builtinFind.bind(this))
    this.commands.set('jq', this.builtinJq.bind(this))
    this.commands.set('mkdir', this.builtinMkdir.bind(this))
  }

  /**
   * Register a custom command.
   * Optionally scope it to a specific resource or filetype.
   */
  registerCommand(
    name: string,
    handler: CommandHandler,
    options?: { resource?: string; filetype?: string }
  ): void {
    const key = options
      ? `${name}:${options.resource ?? '*'}:${options.filetype ?? '*'}`
      : name
    this.commands.set(key, handler)
  }

  /**
   * Parse and execute a full command string (with pipes, redirects).
   */
  async run(commandString: string): Promise<ExecuteResult> {
    try {
      const pipeline = this.parse(commandString)
      const stdout = await this.executePipeline(pipeline)
      return { stdout: stdout.toString(), stderr: '', exitCode: 0 }
    } catch (err) {
      return { stdout: '', stderr: String(err), exitCode: 1 }
    }
  }

  // ================================================================
  // Parser — handles pipes (|), output redirect (>), append (>>),
  //          quoted strings, and glob patterns
  // ================================================================

  private parse(input: string): Pipeline {
    let remaining = input
    let outputPath: string | undefined
    let appendPath: string | undefined

    // Check for >> (append) first, then > (overwrite)
    const appendMatch = remaining.match(/^(.*?)\s*>>\s*(\S+)\s*$/)
    if (appendMatch) {
      remaining = appendMatch[1]
      appendPath = appendMatch[2]
    } else {
      const redirectMatch = remaining.match(/^(.*?)\s*>\s*(\S+)\s*$/)
      if (redirectMatch) {
        remaining = redirectMatch[1]
        outputPath = redirectMatch[2]
      }
    }

    const stages = remaining.split('|').map(stage => this.parseStage(stage.trim()))
    return { stages, outputPath, appendPath }
  }

  /** Tokenize a single command stage — handles double and single quoted strings */
  private parseStage(stage: string): ParsedCommand {
    const tokens: string[] = []
    let current = ''
    let inQuote = false
    let quoteChar = ''

    for (const char of stage) {
      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false
        } else {
          current += char
        }
      } else if (char === '"' || char === "'") {
        inQuote = true
        quoteChar = char
      } else if (char === ' ') {
        if (current) {
          tokens.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }
    if (current) tokens.push(current)

    const [name, ...args] = tokens
    return { name, args }
  }

  // ================================================================
  // Pipeline Executor
  // ================================================================

  private async executePipeline(pipeline: Pipeline): Promise<Buffer> {
    let input: Buffer | undefined

    for (const stage of pipeline.stages) {
      const expandedArgs = await this.expandGlobs(stage.args)
      const handler = this.commands.get(stage.name)
      if (!handler) throw new Error(`Command not found: ${stage.name}`)

      const ctx: CommandContext = { workspace: this.workspace, stdin: input }
      const result = await handler(expandedArgs, ctx)
      input = typeof result === 'string' ? Buffer.from(result) : result
    }

    const output = input ?? Buffer.alloc(0)

    // Handle output redirection
    if (pipeline.outputPath) {
      await this.workspace.writeFile(pipeline.outputPath, output)
      return Buffer.alloc(0)
    }
    if (pipeline.appendPath) {
      const match = this.workspace.resolve(pipeline.appendPath)
      if (match) {
        await match.resource.write(match.relativePath, output, { append: true })
      }
      return Buffer.alloc(0)
    }

    return output
  }

  /** Expand glob patterns (*, ?) in arguments */
  private async expandGlobs(args: string[]): Promise<string[]> {
    const expanded: string[] = []
    for (const arg of args) {
      if (!arg.includes('*') && !arg.includes('?')) {
        expanded.push(arg)
        continue
      }

      // Split into directory part and glob pattern
      const lastSlash = arg.lastIndexOf('/')
      const dirPath = arg.slice(0, lastSlash) || '/'
      const pattern = arg.slice(lastSlash + 1)
      const regex = new RegExp(
        '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
      )

      try {
        const entries = await this.workspace.list(dirPath)
        const matches = entries.filter(e => regex.test(e.name)).map(e => e.path)
        expanded.push(...(matches.length ? matches : [arg]))
      } catch {
        expanded.push(arg)
      }
    }
    return expanded
  }

  // ================================================================
  // Built-in Commands (13 total)
  // ================================================================

  /** cat <path> — Read file contents. Supports stdin passthrough. */
  private async builtinCat(args: string[], ctx: CommandContext): Promise<Buffer> {
    if (ctx.stdin && args.length === 0) return ctx.stdin
    const buffers = await Promise.all(args.map(a => ctx.workspace.readFile(a)))
    return Buffer.concat(buffers)
  }

  /** ls <path> — List directory. Flags: -l (long), -c/--context (rich metadata) */
  private async builtinLs(args: string[], ctx: CommandContext): Promise<Buffer> {
    const flags = args.filter(a => a.startsWith('-'))
    const paths = args.filter(a => !a.startsWith('-'))
    const path = paths[0] ?? '/'
    const longFormat = flags.includes('-l')
    const withContext = flags.includes('--context') || flags.includes('-c')

    if (withContext) {
      const entries = await ctx.workspace.listWithContext(path)
      const lines = entries.map(e => {
        const meta = e.meta
          ? ` [${Object.entries(e.meta)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}]`
          : ''
        return `${e.type === 'directory' ? 'd' : 'f'}  ${e.name}${meta}`
      })
      return Buffer.from(lines.join('\n'))
    }

    const entries = await ctx.workspace.list(path)
    const lines = longFormat
      ? entries.map(
          e =>
            `${e.type === 'directory' ? 'd' : '-'}  ${(e.size ?? 0)
              .toString()
              .padStart(8)}  ${e.name}`
        )
      : entries.map(e => e.name)
    return Buffer.from(lines.join('\n'))
  }

  /** echo <text> — Write text to stdout */
  private async builtinEcho(args: string[]): Promise<Buffer> {
    return Buffer.from(args.join(' '))
  }

  /** cp <src> <dst> — Copy file between any two resources */
  private async builtinCp(args: string[], ctx: CommandContext): Promise<Buffer> {
    const [src, dst] = args
    if (!src || !dst) throw new Error('cp requires source and destination')
    const data = await ctx.workspace.readFile(src)
    await ctx.workspace.writeFile(dst, data)
    return Buffer.alloc(0)
  }

  /** mv <src> <dst> — Move file between resources (copy + delete) */
  private async builtinMv(args: string[], ctx: CommandContext): Promise<Buffer> {
    const [src, dst] = args
    if (!src || !dst) throw new Error('mv requires source and destination')
    const data = await ctx.workspace.readFile(src)
    await ctx.workspace.writeFile(dst, data)
    const srcMatch = ctx.workspace.resolve(src)
    if (srcMatch) await srcMatch.resource.delete(srcMatch.relativePath)
    return Buffer.alloc(0)
  }

  /** rm <path> — Delete file or directory. Flags: -r (recursive, accepted but ignored) */
  private async builtinRm(args: string[], ctx: CommandContext): Promise<Buffer> {
    for (const arg of args.filter(a => !a.startsWith('-'))) {
      const match = ctx.workspace.resolve(arg)
      if (match) await match.resource.delete(match.relativePath)
    }
    return Buffer.alloc(0)
  }

  /** grep <pattern> <files> — Search file contents. Flags: -i, -n, -r */
  private async builtinGrep(args: string[], ctx: CommandContext): Promise<Buffer> {
    const flagIdx = args.findIndex(a => !a.startsWith('-'))
    if (flagIdx === -1) throw new Error('grep requires a pattern')

    const pattern = args[flagIdx]
    const files = args.slice(flagIdx + 1)
    const caseInsensitive = args.slice(0, flagIdx).includes('-i') || args.slice(0, flagIdx).some(f => f.includes('i'))
    const showLineNums = args.slice(0, flagIdx).includes('-n') || args.slice(0, flagIdx).some(f => f.includes('n'))
    const recursive = args.slice(0, flagIdx).includes('-r') || args.slice(0, flagIdx).some(f => f.includes('r'))

    const regex = new RegExp(pattern, caseInsensitive ? 'i' : '')
    const results: string[] = []

    const grepContent = (content: string, filePath: string) => {
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        if (regex.test(line)) {
          if (showLineNums && filePath) {
            results.push(`${filePath}:${i + 1}:${line}`)
          } else {
            results.push(line)
          }
        }
      })
    }

    if (files.length === 0) {
      // Read from stdin
      const content = (ctx.stdin ?? Buffer.alloc(0)).toString()
      grepContent(content, '')
    } else if (recursive) {
      // Recursive search through directories
      const walkAndGrep = async (dirPath: string) => {
        try {
          const entries = await ctx.workspace.list(dirPath)
          for (const entry of entries) {
            if (entry.type === 'directory') {
              await walkAndGrep(entry.path)
            } else {
              const content = (await ctx.workspace.readFile(entry.path)).toString()
              grepContent(content, entry.path)
            }
          }
        } catch {
          // If it's not a directory, try reading it as a file
          try {
            const content = (await ctx.workspace.readFile(dirPath)).toString()
            grepContent(content, dirPath)
          } catch {
            // skip files that can't be read
          }
        }
      }
      for (const f of files) {
        await walkAndGrep(f)
      }
    } else {
      // Grep specific files
      for (const f of files) {
        const content = (await ctx.workspace.readFile(f)).toString()
        grepContent(content, f)
      }
    }

    return Buffer.from(results.join('\n'))
  }

  /** wc — Count lines, words, or bytes. Flags: -l, -w, -c */
  private async builtinWc(args: string[], ctx: CommandContext): Promise<Buffer> {
    const content = ctx.stdin?.toString() ?? ''
    if (args.includes('-l')) {
      return Buffer.from(String(content.split('\n').filter(Boolean).length))
    }
    if (args.includes('-w')) {
      return Buffer.from(String(content.split(/\s+/).filter(Boolean).length))
    }
    if (args.includes('-c')) {
      return Buffer.from(String(Buffer.byteLength(content)))
    }
    const lines = content.split('\n').length
    const words = content.split(/\s+/).filter(Boolean).length
    const bytes = Buffer.byteLength(content)
    return Buffer.from(`${lines} ${words} ${bytes}`)
  }

  /** head — First N lines. Flags: -n <N> (default 10) */
  private async builtinHead(args: string[], ctx: CommandContext): Promise<Buffer> {
    const nIdx = args.indexOf('-n')
    const n = nIdx >= 0 ? parseInt(args[nIdx + 1]) : 10
    const content = ctx.stdin?.toString() ?? ''
    return Buffer.from(content.split('\n').slice(0, n).join('\n'))
  }

  /** tail — Last N lines. Flags: -n <N> (default 10) */
  private async builtinTail(args: string[], ctx: CommandContext): Promise<Buffer> {
    const nIdx = args.indexOf('-n')
    const n = nIdx >= 0 ? parseInt(args[nIdx + 1]) : 10
    const content = ctx.stdin?.toString() ?? ''
    const lines = content.split('\n')
    return Buffer.from(lines.slice(-n).join('\n'))
  }

  /** find <path> — Recursive file search. Flags: -name <glob> */
  private async builtinFind(args: string[], ctx: CommandContext): Promise<Buffer> {
    const root = args.find(a => !a.startsWith('-')) ?? '/'
    const nameIdx = args.indexOf('-name')
    const namePattern = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    const regex = namePattern
      ? new RegExp(namePattern.replace(/\./g, '\\.').replace(/\*/g, '.*'))
      : undefined

    const results: string[] = []
    const walk = async (dirPath: string) => {
      const entries = await ctx.workspace.list(dirPath).catch(() => [])
      for (const entry of entries) {
        if (!regex || regex.test(entry.name)) {
          results.push(entry.path)
        }
        if (entry.type === 'directory') {
          await walk(entry.path)
        }
      }
    }
    await walk(root)
    return Buffer.from(results.join('\n'))
  }

  /** jq <query> — Basic JSON path query. Supports .field, .field.nested, identity (.) */
  private async builtinJq(args: string[], ctx: CommandContext): Promise<Buffer> {
    const query = args[0] ?? '.'
    const input = ctx.stdin?.toString() ?? '{}'
    try {
      const data = JSON.parse(input)
      const result = query === '.' ? data : resolvePath(data, query)
      return Buffer.from(JSON.stringify(result, null, 2))
    } catch {
      return ctx.stdin ?? Buffer.alloc(0)
    }
  }

  /** mkdir <path> — Create directory (writes a .keep marker file) */
  private async builtinMkdir(args: string[], ctx: CommandContext): Promise<Buffer> {
    const dirs = args.filter(a => !a.startsWith('-'))
    for (const dir of dirs) {
      await ctx.workspace.writeFile(`${dir}/.keep`, Buffer.alloc(0))
    }
    return Buffer.alloc(0)
  }
}

/** Resolve a simple jq-style path like ".name.first" against a data object */
function resolvePath(data: unknown, query: string): unknown {
  const parts = query.replace(/^\./, '').split('.').filter(Boolean)
  let current = data
  for (const part of parts) {
    const idx = parseInt(part)
    current =
      Array.isArray(current) && !isNaN(idx)
        ? (current as unknown[])[idx]
        : (current as Record<string, unknown>)?.[part]
  }
  return current
}
