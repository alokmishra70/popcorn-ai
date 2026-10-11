import { getRunSummary, getProjectBySlug, listenForRuns } from '@popcorn-ai/db';
import { database, db } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

/** Server-sent events of run updates for the live view (FR-2.6), fed by Postgres LISTEN/NOTIFY. */
export async function GET(request: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(db, slug);
  if (!project) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = async () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream already closed by the client.
        }
      };
      send(': connected\n\n');

      const unlisten = await listenForRuns(database.sql, async (event) => {
        if (event.projectId !== project.id) return;
        const run = await getRunSummary(db, event.runId);
        if (run) send(`event: run\ndata: ${JSON.stringify(run)}\n\n`);
      });
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

      cleanup = async () => {
        clearInterval(heartbeat);
        await unlisten();
      };
      request.signal.addEventListener('abort', () => {
        void cleanup();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      void cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
