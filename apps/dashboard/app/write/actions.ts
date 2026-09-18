'use server'

import type { Draft, Ref } from '@postdeck/core'
import { generateForProject, saveDraftForProject, publishPost, unpublishPost, publishManyPost, type GenerateResult, type BulkResult } from '../../lib/write.js'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function generateAction(
  input: { projectId: string; topic: string; lang?: string },
): Promise<{ ok: true; result: GenerateResult } | { ok: false; error: string }> {
  try {
    if (!input.projectId || !input.topic) return { ok: false, error: 'project and topic are required' }
    const result = await generateForProject(input.projectId, input.topic, input.lang || undefined)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

export async function saveAction(
  input: { projectId: string; draft: Draft; lang?: string },
): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }> {
  try {
    const ref = await saveDraftForProject(input.projectId, input.draft, input.lang || undefined)
    return { ok: true, ref }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

export async function publishAction(
  input: { projectId: string; postId: string },
): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }> {
  try {
    const ref = await publishPost(input.projectId, input.postId)
    return { ok: true, ref }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

export async function unpublishAction(
  input: { projectId: string; postId: string },
): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }> {
  try {
    const ref = await unpublishPost(input.projectId, input.postId)
    return { ok: true, ref }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

export async function publishManyAction(
  input: { projectId: string; postIds: string[] },
): Promise<{ ok: true; results: BulkResult[] } | { ok: false; error: string }> {
  try {
    if (!input.postIds?.length) return { ok: false, error: 'no posts selected' }
    const results = await publishManyPost(input.projectId, input.postIds)
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}
