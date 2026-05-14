// packages/core/src/snapshot.ts
// Snapshot/Restore — serialize workspace state to JSON for persistence and replay.
// RAM resources are fully serialized; external resources store config only.

import type { Resource } from './resource'
import { isSnapshotable } from './resource'

/**
 * Serialized form of a single mount in the workspace.
 */
export interface MountSnapshot {
  /** Mount path prefix (e.g., '/data', '/scratch') */
  prefix: string
  /** Resource type identifier (e.g., 'ram', 'local-fs') */
  resourceType: string
  /** Full serialized state for snapshotable resources */
  data?: Record<string, unknown>
  /** Whether this resource was fully serialized or config-only */
  snapshotted: boolean
}

/**
 * Complete serialized workspace state.
 */
export interface SnapshotData {
  /** Fold snapshot format version */
  version: 1
  /** ISO timestamp of when the snapshot was taken */
  createdAt: string
  /** All mounts and their serialized state */
  mounts: MountSnapshot[]
}

/**
 * Serialize a single resource if it supports snapshotting.
 * Returns the mount snapshot entry.
 */
export async function serializeMount(
  prefix: string,
  resource: Resource
): Promise<MountSnapshot> {
  if (isSnapshotable(resource)) {
    const data = await resource.serialize()
    return {
      prefix,
      resourceType: data._type as string ?? 'unknown',
      data,
      snapshotted: true,
    }
  }

  // Non-snapshotable resources — store prefix only, no data
  return {
    prefix,
    resourceType: 'external',
    snapshotted: false,
  }
}

/**
 * Build a full snapshot from a mount table.
 */
export async function buildSnapshot(
  mounts: Map<string, Resource>
): Promise<SnapshotData> {
  const mountSnapshots: MountSnapshot[] = []

  for (const [prefix, resource] of mounts) {
    mountSnapshots.push(await serializeMount(prefix, resource))
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    mounts: mountSnapshots,
  }
}

/**
 * Registry of resource deserializers.
 * Resources register themselves so `Workspace.load()` can reconstruct them.
 */
export type ResourceDeserializer = (data: Record<string, unknown>) => Resource

const deserializerRegistry = new Map<string, ResourceDeserializer>()

/**
 * Register a deserializer for a resource type.
 * Call this once per resource type at module load time.
 *
 * @example
 * ```ts
 * registerDeserializer('ram', (data) => RAMResource.deserialize(data))
 * ```
 */
export function registerDeserializer(
  resourceType: string,
  deserializer: ResourceDeserializer
): void {
  deserializerRegistry.set(resourceType, deserializer)
}

/**
 * Get a registered deserializer by resource type.
 */
export function getDeserializer(
  resourceType: string
): ResourceDeserializer | undefined {
  return deserializerRegistry.get(resourceType)
}
