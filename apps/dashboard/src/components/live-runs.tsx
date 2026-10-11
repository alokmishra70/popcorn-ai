'use client';

import {
  formatDuration,
  formatTokens,
  formatUsd,
  type RunFlag,
  type RunStatus,
} from '@popcorn-ai/core';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn, shortId } from '@/lib/utils';
import { EmptyState } from './page-header';
import { FlagBadges, StatusBadge } from './run-badges';
import { Card } from './ui/card';
import { Table, Td, Th, Tr } from './ui/table';

interface LiveRun {
  id: string;
  name: string;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  flags: RunFlag[];
  stepCount: number;
}

const MAX_ROWS = 200;

/** Watch: runs appear and update as spans arrive, without a refresh (FR-2.6). */
export function LiveRuns({ project }: { project: string }) {
  const [runs, setRuns] = useState<LiveRun[]>([]);
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const source = new EventSource(`/api/p/${project}/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('run', (event) => {
      const run = JSON.parse((event as MessageEvent<string>).data) as LiveRun;
      setRuns((current) => [run, ...current.filter((r) => r.id !== run.id)].slice(0, MAX_ROWS));
      setFresh((current) => new Set(current).add(run.id));
      setTimeout(
        () =>
          setFresh((current) => {
            const next = new Set(current);
            next.delete(run.id);
            return next;
          }),
        1500,
      );
    });
    return () => source.close();
  }, [project]);

  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <span
          className={cn('size-2 rounded-full', connected ? 'animate-pulse bg-ok' : 'bg-muted')}
        />
        {connected ? 'Live. New runs appear as their spans arrive.' : 'Connecting...'}
      </p>
      {runs.length === 0 ? (
        <EmptyState title="Waiting for the next show">
          Runs started from now on will appear here.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Run</Th>
                <Th>Duration</Th>
                <Th>Steps</Th>
                <Th>Tokens</Th>
                <Th>Cost</Th>
                <Th>Flags</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <Tr key={run.id} className={cn(fresh.has(run.id) && 'bg-brand-soft/40')}>
                  <Td>
                    <StatusBadge status={run.status} />
                  </Td>
                  <Td>
                    <Link
                      className="font-medium hover:text-brand"
                      href={`/p/${project}/runs/${run.id}`}
                    >
                      {run.name}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted">{shortId(run.id)}</span>
                  </Td>
                  <Td className="tabular-nums">{formatDuration(run.durationMs)}</Td>
                  <Td className="tabular-nums">{run.stepCount}</Td>
                  <Td className="tabular-nums">{formatTokens(run.tokensIn + run.tokensOut)}</Td>
                  <Td className="tabular-nums">{formatUsd(run.costUsd)}</Td>
                  <Td>
                    <FlagBadges flags={run.flags} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
