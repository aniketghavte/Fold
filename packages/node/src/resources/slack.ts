// packages/node/src/resources/slack.ts
// SlackResource — channels as directories, messages as JSONL files.
// Requires: npm install @slack/web-api @slack/socket-mode

import type { Resource, Entry, FileStat, ResourceEvent, ReactiveResource, ContextualResource } from '@fold/core'
import type { ContextEntry } from '@fold/core'

export interface SlackConfig {
  token: string
  appToken?: string
}

export class SlackResource implements Resource, ReactiveResource, ContextualResource {
  private client: import('@slack/web-api').WebClient
  private socketClient?: import('@slack/socket-mode').SocketModeClient
  private appToken?: string

  constructor(config: SlackConfig) {
    const { WebClient } = require('@slack/web-api') as typeof import('@slack/web-api')
    this.client = new WebClient(config.token)
    this.appToken = config.appToken
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts.length === 0) {
      return [
        { name: 'channels', path: '/channels', type: 'directory' },
        { name: 'users', path: '/users', type: 'directory' },
      ]
    }
    if (parts[0] === 'channels' && parts.length === 1) {
      const res = await this.client.conversations.list({ types: 'public_channel,private_channel' })
      return (res.channels ?? []).map(c => ({ name: c.name!, path: `/channels/${c.name}`, type: 'directory' as const }))
    }
    if (parts[0] === 'channels' && parts.length === 2) {
      const dates: Entry[] = []
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = d.toISOString().split('T')[0]
        dates.push({ name: `${ds}.jsonl`, path: `/channels/${parts[1]}/${ds}.jsonl`, type: 'file' })
      }
      return dates
    }
    if (parts[0] === 'users' && parts.length === 1) {
      const res = await this.client.users.list({})
      return (res.members ?? []).filter(u => !u.deleted && !u.is_bot).map(u => ({ name: u.id!, path: `/users/${u.id}`, type: 'file' as const }))
    }
    return []
  }

  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts[0] === 'channels' && parts.length === 1) {
      const res = await this.client.conversations.list({ types: 'public_channel,private_channel' })
      return (res.channels ?? []).map(c => ({
        name: c.name!, path: `/channels/${c.name}`, type: 'directory' as const,
        meta: {
          memberCount: c.num_members,
          lastActivity: c.updated ? new Date(c.updated * 1000) : undefined,
          summary: `${c.num_members} members · ${c.purpose?.value ?? ''}`.trim(),
        },
      }))
    }
    return this.list(vfsPath)
  }

  async read(vfsPath: string): Promise<Buffer> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts[0] === 'channels' && parts.length === 3) {
      const channelName = parts[1]
      const date = parts[2].replace('.jsonl', '')
      const channels = await this.client.conversations.list({ types: 'public_channel,private_channel' })
      const channel = channels.channels?.find(c => c.name === channelName)
      if (!channel?.id) throw new Error(`Channel not found: ${channelName}`)
      const oldest = new Date(date).getTime() / 1000
      const res = await this.client.conversations.history({ channel: channel.id, oldest: String(oldest), latest: String(oldest + 86400), limit: 1000 })
      const lines = (res.messages ?? []).map(m => JSON.stringify({ ts: m.ts, user: m.user, text: m.text, thread_ts: m.thread_ts, reply_count: m.reply_count }))
      return Buffer.from(lines.join('\n'))
    }
    if (parts[0] === 'users' && parts.length === 2) {
      const res = await this.client.users.info({ user: parts[1] })
      return Buffer.from(JSON.stringify(res.user, null, 2))
    }
    throw new Error(`Cannot read: ${vfsPath}`)
  }

  async write(): Promise<void> { throw new Error('SlackResource is read-only') }
  async stat(): Promise<FileStat> { return { type: 'file', exists: true } }
  async delete(): Promise<void> { throw new Error('SlackResource is read-only') }

  subscribe(vfsPath: string, handler: (event: ResourceEvent) => void): () => void {
    if (!this.appToken) throw new Error('appToken required for Slack reactive mode')
    if (!this.socketClient) {
      const { SocketModeClient } = require('@slack/socket-mode') as typeof import('@slack/socket-mode')
      this.socketClient = new SocketModeClient({ appToken: this.appToken })
      this.socketClient.start()
    }
    const watchChannel = vfsPath.split('/').filter(Boolean)[1]
    const listener = async ({ event }: { event: { channel: string; ts: string; text?: string; type: string } }) => {
      if (event.type !== 'message') return
      handler({ type: 'created', path: `/channels/${watchChannel}/${new Date().toISOString().split('T')[0]}.jsonl`, resource: 'slack', timestamp: new Date(), metadata: { text: event.text, ts: event.ts } })
    }
    this.socketClient.on('message', listener)
    return () => { this.socketClient?.off('message', listener) }
  }
}
