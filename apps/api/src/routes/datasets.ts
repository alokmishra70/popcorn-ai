import { checkListSchema } from '@popcornai/core';
import {
  addTestCase,
  getDataset,
  listDatasets,
  listTestCases,
  SourceRunNotFoundError,
  type Database,
} from '@popcornai/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError, notFound } from '../lib/errors';

const datasetName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+$/, 'letters, digits, dot, dash and underscore only');

const newCase = z
  .object({
    sourceRunId: z.uuid().optional(),
    agent: z.string().min(1).max(200).optional(),
    name: z.string().min(1).max(200).optional(),
    input: z.unknown().optional(),
    expected: z.unknown().optional(),
    checks: checkListSchema.default([]),
  })
  .refine((body) => body.sourceRunId !== undefined || body.input !== undefined, {
    message: 'either sourceRunId or input is required',
  });

export const datasetRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.get('/v1/datasets', async (request) => ({
    items: await listDatasets(db, request.project.id),
  }));

  app.get('/v1/datasets/:name', async (request) => {
    const { name } = z.object({ name: datasetName }).parse(request.params);
    const dataset = await getDataset(db, request.project.id, name);
    if (!dataset) throw notFound(`dataset "${name}"`);
    return { dataset, cases: await listTestCases(db, dataset.id) };
  });

  app.post('/v1/datasets/:name/cases', async (request, reply) => {
    const { name } = z.object({ name: datasetName }).parse(request.params);
    const body = newCase.parse(request.body);
    try {
      const testCase = await addTestCase(db, request.project.id, name, {
        ...body,
        agentName: body.agent,
      });
      return reply
        .status(201)
        .send({ id: testCase.id, datasetId: testCase.datasetId, name: testCase.name });
    } catch (error) {
      if (error instanceof SourceRunNotFoundError)
        throw new HttpError(404, error.message, 'not_found');
      throw error;
    }
  });
};
