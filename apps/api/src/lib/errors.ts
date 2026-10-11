import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');

/** One error shape for every route: `{ code, message, issues? }`. */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      code: 'invalid_request',
      message: 'Request failed validation',
      issues: error.issues
        .slice(0, 20)
        .map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode && statusCode < 500) {
    return reply
      .status(statusCode)
      .send({ code: (error as FastifyError).code ?? 'error', message: error.message });
  }
  request.log.error({ err: error }, 'unhandled error');
  return reply.status(500).send({ code: 'internal', message: 'Internal server error' });
}
