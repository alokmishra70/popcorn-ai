import type { FastifyPluginAsync } from 'fastify';
import type { RunEvents } from '../lib/run-events';

const HEARTBEAT_MS = 15_000;

/** Server-sent events of run updates for the authenticated project; used by `popcorn watch`. */
export const streamRoutes: FastifyPluginAsync<{ events: RunEvents }> = async (app, { events }) => {
  app.get('/v1/stream', async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');

    const unsubscribe = await events.subscribe(request.project.id, (event) => {
      res.write(`event: run\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};
