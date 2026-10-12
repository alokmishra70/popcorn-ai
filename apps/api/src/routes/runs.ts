import { RUN_FLAGS, RUN_STATUSES, diffRuns } from '@popcornai/core';
import { getReplayBundle, getRun, listRuns, type Database } from '@popcornai/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors';

const csvList = z.string().transform((value) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

const listQuery = z.object({
  status: z.enum(RUN_STATUSES).optional(),
  flags: csvList.pipe(z.array(z.enum(RUN_FLAGS))).optional(),
  flagged: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  model: z.string().optional(),
  tool: z.string().optional(),
  name: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minCost: z.coerce.number().nonnegative().optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const runParams = z.object({ id: z.uuid() });
const diffParams = z.object({ id: z.uuid(), otherId: z.uuid() });

export const runRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.get('/v1/runs', async (request) => {
    const query = listQuery.parse(request.query);
    return listRuns(
      db,
      request.project.id,
      {
        status: query.status,
        flags: query.flags,
        flagged: query.flagged,
        model: query.model,
        tool: query.tool,
        name: query.name,
        from: query.from,
        to: query.to,
        minCostUsd: query.minCost,
        search: query.q,
      },
      { cursor: query.cursor, limit: query.limit },
    );
  });

  app.get('/v1/runs/:id', async (request) => {
    const { id } = runParams.parse(request.params);
    const detail = await getRun(db, request.project.id, id);
    if (!detail) throw notFound('run');
    return detail;
  });

  app.get('/v1/runs/:id/replay', async (request) => {
    const { id } = runParams.parse(request.params);
    const bundle = await getReplayBundle(db, request.project.id, id);
    if (!bundle) throw notFound('run');
    return bundle;
  });

  app.get('/v1/runs/:id/diff/:otherId', async (request) => {
    const { id, otherId } = diffParams.parse(request.params);
    const [original, replay] = await Promise.all([
      getRun(db, request.project.id, id),
      getRun(db, request.project.id, otherId),
    ]);
    if (!original || !replay) throw notFound('run');
    return diffRuns(original.spans, replay.spans);
  });
};
