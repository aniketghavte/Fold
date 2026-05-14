// packages/core/tests/reactive.test.ts
// Tests for ReactiveEngine — register, emit, path matching, unsubscribe, debounce, filter

import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngine } from '../src/reactive'
import type { ResourceEvent } from '../src/resource'

function makeEvent(path: string, type: ResourceEvent['type'] = 'created'): ResourceEvent {
  return { type, path, resource: 'test', timestamp: new Date() }
}

describe('ReactiveEngine', () => {
  test('emit delivers event to matching subscriber', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    engine.register('/data', (e) => { events.push(e) })

    engine.emit('/data/file.txt', makeEvent('/data/file.txt'))
    expect(events).toHaveLength(1)
    expect(events[0].path).toBe('/data/file.txt')
  })

  test('emit does not deliver to non-matching subscriber', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    engine.register('/other', (e) => { events.push(e) })

    engine.emit('/data/file.txt', makeEvent('/data/file.txt'))
    expect(events).toHaveLength(0)
  })

  test('prefix matching — /data matches /data/sub/file.txt', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    engine.register('/data', (e) => { events.push(e) })

    engine.emit('/data/sub/file.txt', makeEvent('/data/sub/file.txt'))
    expect(events).toHaveLength(1)
  })

  test('multiple subscribers receive same event', () => {
    const engine = new ReactiveEngine()
    const events1: ResourceEvent[] = []
    const events2: ResourceEvent[] = []
    engine.register('/data', (e) => { events1.push(e) })
    engine.register('/data', (e) => { events2.push(e) })

    engine.emit('/data/file.txt', makeEvent('/data/file.txt'))
    expect(events1).toHaveLength(1)
    expect(events2).toHaveLength(1)
  })

  test('unsubscribe stops event delivery', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    const unsub = engine.register('/data', (e) => { events.push(e) })

    engine.emit('/data/a.txt', makeEvent('/data/a.txt'))
    unsub()
    engine.emit('/data/b.txt', makeEvent('/data/b.txt'))

    expect(events).toHaveLength(1)
    expect(events[0].path).toBe('/data/a.txt')
  })

  test('filter option blocks non-matching events', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    engine.register('/data', (e) => { events.push(e) }, {
      filter: (e) => e.type === 'deleted',
    })

    engine.emit('/data/a.txt', makeEvent('/data/a.txt', 'created'))
    engine.emit('/data/b.txt', makeEvent('/data/b.txt', 'deleted'))

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('deleted')
  })

  test('debounce delays callback execution', async () => {
    vi.useFakeTimers()
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []

    engine.register('/data', (e) => { events.push(e) }, { debounceMs: 100 })

    // Fire 3 rapid events
    engine.emit('/data/a.txt', makeEvent('/data/a.txt'))
    engine.emit('/data/b.txt', makeEvent('/data/b.txt'))
    engine.emit('/data/c.txt', makeEvent('/data/c.txt'))

    // Nothing yet — debounce timer hasn't fired
    expect(events).toHaveLength(0)

    // Advance past debounce
    vi.advanceTimersByTime(150)
    // Allow microtasks to flush
    await vi.runAllTimersAsync()

    // Only the last event should have been delivered (debounce replaces)
    expect(events).toHaveLength(1)
    expect(events[0].path).toBe('/data/c.txt')

    vi.useRealTimers()
  })

  test('root subscription matches all paths', () => {
    const engine = new ReactiveEngine()
    const events: ResourceEvent[] = []
    engine.register('/', (e) => { events.push(e) })

    engine.emit('/data/file.txt', makeEvent('/data/file.txt'))
    engine.emit('/other/thing.json', makeEvent('/other/thing.json'))

    expect(events).toHaveLength(2)
  })

  test('emit with no subscribers is a no-op', () => {
    const engine = new ReactiveEngine()
    // Should not throw
    engine.emit('/data/file.txt', makeEvent('/data/file.txt'))
  })
})
