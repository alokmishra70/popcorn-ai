import { compareEvalRuns, type CheckResult } from '@popcornai/core';
import {
  findBaselineEvalRun,
  getDataset,
  getEvalRun,
  listTestCases,
  recordEvalRun,
  toEvalOutcome,
  type Database,
} from '@popcornai/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError, notFound } from '../lib/errors';

const checkResult = z.object({
  name: z.string(),
  type: z.string(),
  passed: z.boolean(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
  judge: z.object({ model: z.string(), promptVersion: z.string() }).optional(),
});

const newEvalRun = z.object({
  id: z.uuid().optional(),
  dataset: z.string().min(1),
  gitSha: z.string().max(64).nullish(),
  gitBranch: z.string().max(200).nullish(),
  label: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  promptHash: z.string().max(128).nullish(),
  repeat: z.number().int().min(1).max(20).default(1),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date(),
  results: z
    .array(
      z.object({
        testCaseId: z.uuid(),
        runId: z.uuid().nullable(),
        attempt: z.number().int().nonnegative(),
        passed: z.boolean(),
        checkResults: z.array(checkResult),
        costUsd: z.number().nonnegative(),
        durationMs: z.number().nonnegative(),
        error: z.string().max(10_000).nullish(),
      }),
    )
    .max(10_000),
});

const compareQuery = z.object({
  baseline: z.uuid().optional(),
  branch: z.string().default('main'),
});

export const evalRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.post('/v1/eval-runs', async (request, reply) => {
    const body = newEvalRun.parse(request.body);
    const dataset = await getDataset(db, request.project.id, body.dataset);
    if (!dataset) throw notFound(`dataset "${body.dataset}"`);

    const knownCases = new Set((await listTestCases(db, dataset.id)).map((c) => c.id));
    const unknown = body.results.find((r) => !knownCases.has(r.testCaseId));
    if (unknown)
      throw new HttpError(
        400,
        `test case ${unknown.testCaseId} is not in "${dataset.name}"`,
        'invalid_request',
      );

    const evalRun = await recordEvalRun(db, {
      ...body,
      projectId: request.project.id,
      datasetId: dataset.id,
      results: body.results.map((r) => ({ ...r, checkResults: r.checkResults as CheckResult[] })),
    });
    return reply.status(201).send(evalRun);
  });

  /** The latest eval run of a suite on a branch; the CLI compares against it. */
  app.get('/v1/datasets/:name/eval-runs/latest', async (request) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(request.params);
    const { branch, exclude } = z
      .object({ branch: z.string().default('main'), exclude: z.uuid().optional() })
      .parse(request.query);
    const dataset = await getDataset(db, request.project.id, name);
    if (!dataset) throw notFound(`dataset "${name}"`);
    const latest = await findBaselineEvalRun(db, dataset.id, branch, exclude);
    if (!latest) throw notFound(`eval run on ${branch}`);
    return getEvalRun(db, request.project.id, latest.id);
  });

  app.get('/v1/eval-runs/:id', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const detail = await getEvalRun(db, request.project.id, id);
    if (!detail) throw notFound('eval run');
    return detail;
  });

  /** FR-4.5: compare with an explicit baseline, or the latest run of the same suite on a branch. */
  app.get('/v1/eval-runs/:id/compare', async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const query = compareQuery.parse(request.query);
    const current = await getEvalRun(db, request.project.id, id);
    if (!current) throw notFound('eval run');

    const baselineId =
      query.baseline ??
      (await findBaselineEvalRun(db, current.evalRun.datasetId, query.branch, id))?.id;
    const baseline = baselineId ? await getEvalRun(db, request.project.id, baselineId) : null;

    return {
      evalRunId: id,
      baselineEvalRunId: baseline?.evalRun.id ?? null,
      comparison: compareEvalRuns(
        toEvalOutcome(current),
        baseline ? toEvalOutcome(baseline) : null,
      ),
    };
  });
};
