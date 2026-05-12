// packages/node/src/resources/github.ts
// GitHubResource — repos as directories, files readable via GitHub API.
// Requires: No external deps (uses native fetch)

import type { Resource, Entry, FileStat, ContextualResource } from '@fold/core'
import type { ContextEntry } from '@fold/core'

export interface GitHubConfig {
  token?: string
  owner?: string
  repo?: string
}

export class GitHubResource implements Resource, ContextualResource {
  private token?: string
  private defaultOwner?: string
  private defaultRepo?: string

  constructor(config: GitHubConfig = {}) {
    this.token = config.token ?? process.env.GITHUB_TOKEN
    this.defaultOwner = config.owner
    this.defaultRepo = config.repo
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'fold-vfs' }
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  private async api(path: string): Promise<unknown> {
    const res = await fetch(`https://api.github.com${path}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
    return res.json()
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts.length === 0 && this.defaultOwner && this.defaultRepo) {
      const data = await this.api(`/repos/${this.defaultOwner}/${this.defaultRepo}/contents/`) as { name: string; type: string; size?: number }[]
      return data.map(f => ({ name: f.name, path: `/${f.name}`, type: f.type === 'dir' ? 'directory' as const : 'file' as const, size: f.size }))
    }
    if (parts.length === 0) {
      const data = await this.api('/user/repos?per_page=100&sort=updated') as { full_name: string; name: string }[]
      return data.map(r => ({ name: r.full_name, path: `/${r.full_name}`, type: 'directory' as const }))
    }
    if (parts.length >= 2) {
      const owner = parts[0]; const repo = parts[1]; const filePath = parts.slice(2).join('/')
      const data = await this.api(`/repos/${owner}/${repo}/contents/${filePath}`) as { name: string; type: string; size?: number }[]
      if (Array.isArray(data)) {
        return data.map(f => ({ name: f.name, path: `/${owner}/${repo}/${filePath ? filePath + '/' : ''}${f.name}`, type: f.type === 'dir' ? 'directory' as const : 'file' as const, size: f.size }))
      }
    }
    return []
  }

  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    const base = await this.list(vfsPath)
    return base.map(e => ({ ...e, meta: e.size ? { language: extToLang(e.name) } : { itemCount: undefined } } as ContextEntry))
  }

  async read(vfsPath: string): Promise<Buffer> {
    const parts = vfsPath.split('/').filter(Boolean)
    let owner: string, repo: string, filePath: string
    if (this.defaultOwner && this.defaultRepo && parts.length >= 1) {
      owner = this.defaultOwner; repo = this.defaultRepo; filePath = parts.join('/')
    } else if (parts.length >= 3) {
      owner = parts[0]; repo = parts[1]; filePath = parts.slice(2).join('/')
    } else { throw new Error(`Invalid path: ${vfsPath}`) }
    const data = await this.api(`/repos/${owner}/${repo}/contents/${filePath}`) as { content?: string; encoding?: string }
    if (!data.content) throw new Error(`No content at: ${vfsPath}`)
    return Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64')
  }

  async write(): Promise<void> { throw new Error('GitHubResource is read-only (use GitHub API directly for writes)') }
  async stat(vfsPath: string): Promise<FileStat> {
    try { await this.read(vfsPath); return { type: 'file', exists: true } }
    catch { return { type: 'file', exists: false } }
  }
  async delete(): Promise<void> { throw new Error('GitHubResource is read-only') }
}

function extToLang(name: string): string | undefined {
  const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
  const map: Record<string, string> = { '.ts': 'TypeScript', '.js': 'JavaScript', '.py': 'Python', '.md': 'Markdown', '.json': 'JSON', '.rs': 'Rust', '.go': 'Go' }
  return map[ext]
}
