'use server';

import { checkListSchema } from '@popcornai/core';
import {
  addTestCase,
  createApiKey,
  createProject,
  revokeApiKey,
  setJudgeVerdict,
  SLUG_PATTERN,
  SourceRunNotFoundError,
  updateProjectSettings,
} from '@popcornai/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from './db';
import { env } from './env';
import { requireProject } from './project';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function assertWritable() {
  if (env.readOnly) throw new Error('This dashboard is read-only');
}

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error:
    error instanceof z.ZodError
      ? error.issues.map((i) => i.message).join('; ')
      : error instanceof Error
        ? error.message
        : String(error),
});

export async function createProjectAction(_: unknown, form: FormData): Promise<ActionResult> {
  assertWritable();
  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Name is required').max(100),
      slug: z.string().trim().regex(SLUG_PATTERN, 'Slug: lowercase letters, digits and dashes'),
    })
    .safeParse({ name: form.get('name'), slug: form.get('slug') });
  if (!parsed.success) return fail(parsed.error);

  try {
    await createProject(db, parsed.data);
  } catch (error) {
    return fail(String(error).includes('unique') ? new Error('That slug is taken') : error);
  }
  redirect(`/p/${parsed.data.slug}/settings`);
}

export async function createApiKeyAction(
  projectSlug: string,
  name: string,
): Promise<ActionResult<{ key: string }>> {
  assertWritable();
  const project = await requireProject(projectSlug);
  const label = name.trim() || `key ${new Date().toISOString().slice(0, 10)}`;
  const { key } = await createApiKey(db, project.id, label.slice(0, 100));
  revalidatePath(`/p/${projectSlug}/settings`);
  return { ok: true, data: { key } };
}

export async function revokeApiKeyAction(
  projectSlug: string,
  keyId: string,
): Promise<ActionResult> {
  assertWritable();
  const project = await requireProject(projectSlug);
  await revokeApiKey(db, project.id, keyId);
  revalidatePath(`/p/${projectSlug}/settings`);
  return { ok: true, data: undefined };
}

export async function updateSettingsAction(
  projectSlug: string,
  _: unknown,
  form: FormData,
): Promise<ActionResult> {
  assertWritable();
  const project = await requireProject(projectSlug);
  const parsed = z
    .object({
      costThresholdUsd: z.coerce.number().positive('Cost threshold must be above 0').max(1000),
      maxSteps: z.coerce.number().int().min(1).max(1000),
    })
    .safeParse({ costThresholdUsd: form.get('costThresholdUsd'), maxSteps: form.get('maxSteps') });
  if (!parsed.success) return fail(parsed.error);
  await updateProjectSettings(db, project.id, parsed.data);
  revalidatePath(`/p/${projectSlug}/settings`);
  return { ok: true, data: undefined };
}

const testCaseInput = z.object({
  dataset: z
    .string()
    .trim()
    .min(1, 'Dataset is required')
    .max(100)
    .regex(/^[\w.-]+$/, 'Dataset: letters, digits, dot, dash, underscore'),
  name: z.string().trim().max(200).optional(),
  expected: z.string().optional(),
  checks: z.string().optional(),
});

function parseJsonField(label: string, text: string | undefined): unknown {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

/** FR-4.1: save a recorded run as a test case from the run page. */
export async function saveTestCaseAction(
  projectSlug: string,
  runId: string,
  input: z.input<typeof testCaseInput>,
): Promise<ActionResult<{ dataset: string }>> {
  assertWritable();
  try {
    const project = await requireProject(projectSlug);
    const fields = testCaseInput.parse(input);
    const checks = checkListSchema.parse(parseJsonField('Checks', fields.checks) ?? []);
    await addTestCase(db, project.id, fields.dataset, {
      sourceRunId: runId,
      name: fields.name || undefined,
      expected: parseJsonField('Expected', fields.expected),
      checks,
    });
    revalidatePath(`/p/${projectSlug}/datasets`);
    return { ok: true, data: { dataset: fields.dataset } };
  } catch (error) {
    if (error instanceof SourceRunNotFoundError) return { ok: false, error: 'Run not found' };
    return fail(error);
  }
}

/** FR-4.7: mark a judge verdict right or wrong. */
export async function setJudgeVerdictAction(
  projectSlug: string,
  evalRunId: string,
  resultId: string,
  correct: boolean | null,
): Promise<ActionResult> {
  assertWritable();
  const project = await requireProject(projectSlug);
  await setJudgeVerdict(db, project.id, resultId, correct);
  revalidatePath(`/p/${projectSlug}/reviews/${evalRunId}`);
  return { ok: true, data: undefined };
}
