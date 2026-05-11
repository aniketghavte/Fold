// packages/core/src/reactive.ts
// Reactive engine — enables ws.watch() for push-based agent triggers.
// This is the difference between a tool and a runtime.

import type { ResourceEvent } from './resource'

/**
 * Callback for watch events.
 */
export type WatchCallback = (event: ResourceEvent) => void | Promise<void>

/**
 * Options for configuring a watch subscription.
 */
export interface WatchOptions {
  /** Debounce rapid events by this many milliseconds (default: 0) */
  debounceMs?: number
  /** Filter function — only events passing this filter trigger the callback */
  filter?: (event: ResourceEvent) => boolean
}

/**
 * Central reactive engine that coordinates watch subscriptions.
 * Resources emit events → ReactiveEngine routes them to registered callbacks.
 */
export class ReactiveEngine {
  private subscriptions: Map<string, {
    unsubscribe: () => void
    callbacks: Set<WatchCallback>
  }> = new Map()

  /**
   * Register a callback for events at a given path.
   * @returns An unsubscribe function.
   */
  register(
    path: string,
    callback: WatchCallback,
    options: WatchOptions = {}
  ): () => void {
    if (!this.subscriptions.has(path)) {
      this.subscriptions.set(path, { unsubscribe: () => {}, callbacks: new Set() })
    }

    const sub = this.subscriptions.get(path)!

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const wrappedCallback: WatchCallback = async (event) => {
      if (options.filter && !options.filter(event)) return

      if (options.debounceMs && options.debounceMs > 0) {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          Promise.resolve(callback(event)).catch(console.error)
        }, options.debounceMs)
      } else {
        await callback(event)
      }
    }

    sub.callbacks.add(wrappedCallback)
    return () => {
      sub.callbacks.delete(wrappedCallback)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }

  /**
   * Emit an event — routes it to all matching subscriptions.
   * A subscription matches if the event path starts with the watch path.
   */
  emit(path: string, event: ResourceEvent): void {
    for (const [watchPath, sub] of this.subscriptions) {
      if (path.startsWith(watchPath)) {
        sub.callbacks.forEach(cb => {
          Promise.resolve(cb(event)).catch(console.error)
        })
      }
    }
  }
}
