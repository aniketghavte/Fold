import { describe, test, expect, vi, beforeEach } from 'vitest'
import { SlackResource } from '../src/resources/slack'

// Mock Slack SDK
const mockConversationsList = vi.fn()
const mockConversationsHistory = vi.fn()
const mockChatPostMessage = vi.fn()

vi.mock('@slack/web-api', () => {
  return {
    WebClient: vi.fn(() => ({
      conversations: {
        list: mockConversationsList,
        history: mockConversationsHistory,
      },
      chat: {
        postMessage: mockChatPostMessage,
      }
    }))
  }
})

describe('SlackResource', () => {
  let slack: SlackResource

  beforeEach(() => {
    vi.clearAllMocks()
    slack = new SlackResource({ token: 'test-token' })
  })

  test('list root directories (channels)', async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: 'C1', name: 'general', num_members: 10, is_archived: false },
        { id: 'C2', name: 'random', num_members: 5, is_archived: false }
      ]
    })

    const entries = await slack.list('/')
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe('channels')
    expect(entries[0].type).toBe('directory')
    expect(entries[1].name).toBe('users')
  })

  test('list messages in channel (as files)', async () => {
    const entries = await slack.list('/channels/general')
    expect(entries).toHaveLength(30) // 30 days of files
    expect(entries[0].name).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/)
    expect(entries[0].type).toBe('file')
  })

  test('read message file', async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: 'C1', name: 'general' }]
    })
    mockConversationsHistory.mockResolvedValueOnce({
      messages: [
        { ts: '123456.0001', text: 'hello world', user: 'U1' }
      ]
    })

    const data = await slack.read('/channels/general/2026-05-01.jsonl')
    const lines = data.toString().split('\n')
    const json = JSON.parse(lines[0])
    expect(json.text).toBe('hello world')
    expect(json.user).toBe('U1')
  })

  test('write is not supported', async () => {
    await expect(slack.write('/channels/general/new_message.json', Buffer.from('hello'))).rejects.toThrow('SlackResource is read-only')
  })

  test('stat existing channel', async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: 'C1', name: 'general' }]
    })
    const stat = await slack.stat('/general')
    expect(stat.exists).toBe(true)
    expect(stat.type).toBe('file')
  })

  test('delete is not supported', async () => {
    await expect(slack.delete('/channels/general/msg')).rejects.toThrow('SlackResource is read-only')
  })
})
