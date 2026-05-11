// packages/core/src/context.ts
// Rich context types for LLM-aware directory listings.
// Resources that implement ContextualResource return these enriched entries.

import type { Entry } from './resource'

/**
 * An enriched directory entry that includes structured metadata.
 * This is what `ls -c` returns — saving the LLM 3-4 follow-up tool calls.
 *
 * Example: Instead of bare "general, incident, dev-backend",
 * the agent sees:
 *   d  incident   [memberCount=18, lastActivity=2026-05-10T14:55:00, unreadCount=47]
 */
export interface ContextEntry extends Entry {
  /** Human-readable summary of what this file/directory contains */
  summary?: string

  /** Quantitative metadata — varies per resource type */
  meta?: {
    // ---- Directory metadata ----
    /** Number of items in the directory */
    itemCount?: number
    /** When the last activity occurred */
    lastActivity?: Date
    /** Whether something is actively happening */
    activeNow?: boolean

    // ---- File metadata ----
    /** Number of rows (CSV, SQLite tables) */
    rowCount?: number
    /** Column names / schema info */
    schema?: string[]
    /** Number of lines in the file */
    lineCount?: number
    /** Detected programming language */
    language?: string
    /** Number of unread items (Slack channels) */
    unreadCount?: number
    /** Number of members (Slack channels) */
    memberCount?: number

    // ---- Model resources (Ollama) ----
    /** Model file size */
    modelSize?: string
    /** Context window size in tokens */
    contextWindow?: number
    /** Quantization level */
    quantization?: string

    /** Arbitrary extra metadata */
    [key: string]: unknown
  }
}
