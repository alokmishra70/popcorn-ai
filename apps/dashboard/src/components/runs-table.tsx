'use client';

import {
  formatDuration,
  formatTokens,
  formatUsd,
  type RunFlag,
  type RunStatus,
} from '@popcorn-ai/core';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTime, shortId, timeAgo } from '@/lib/utils';
import { FlagBadges, StatusBadge } from './run-badges';
import { Table, Td, Th, Tr } from './ui/table';

export interface RunRow {
  id: string;
  name: string;
  status: RunStatus;
  startedAt: Date;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  flags: RunFlag[];
  stepCount: number;
  models: string[];
  replayOfRunId: string | null;
}

const column = createColumnHelper<RunRow>();

export function RunsTable({ project, runs }: { project: string; runs: RunRow[] }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = [
    column.accessor('status', {
      header: 'Status',
      cell: (c) => <StatusBadge status={c.getValue()} />,
    }),
    column.accessor('name', {
      header: 'Run',
      cell: (c) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/p/${project}/runs/${c.row.original.id}`}
            className="truncate font-medium hover:text-brand"
            onClick={(e) => e.stopPropagation()}
          >
            {c.getValue()}
          </Link>
          <span className="flex items-center gap-1 font-mono text-xs text-muted">
            {shortId(c.row.original.id)}
            {c.row.original.replayOfRunId ? (
              <span
                className="flex items-center gap-0.5"
                title={`Replay of ${c.row.original.replayOfRunId}`}
              >
                <RotateCcw className="size-3" /> rewind
              </span>
            ) : null}
          </span>
        </div>
      ),
    }),
    column.accessor('startedAt', {
      header: 'Started',
      cell: (c) => <span title={formatDateTime(c.getValue())}>{timeAgo(c.getValue())}</span>,
      sortingFn: 'datetime',
    }),
    column.accessor('durationMs', {
      header: 'Duration',
      cell: (c) => formatDuration(c.getValue()),
    }),
    column.accessor('stepCount', { header: 'Steps' }),
    column.accessor((r) => r.tokensIn + r.tokensOut, {
      id: 'tokens',
      header: 'Tokens',
      cell: (c) => formatTokens(c.getValue()),
    }),
    column.accessor('costUsd', { header: 'Cost', cell: (c) => formatUsd(c.getValue()) }),
    column.accessor('models', {
      header: 'Model',
      enableSorting: false,
      cell: (c) => <span className="text-xs text-muted">{c.getValue().join(', ') || '-'}</span>,
    }),
    column.accessor('flags', {
      header: 'Flags',
      enableSorting: false,
      cell: (c) => <FlagBadges flags={c.getValue()} />,
    }),
  ];

  const table = useReactTable({
    data: runs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <Th
                  key={header.id}
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : null}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </Th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <Tr
            key={row.id}
            className="cursor-pointer"
            onClick={() => router.push(`/p/${project}/runs/${row.original.id}`)}
          >
            {row.getVisibleCells().map((cell) => (
              <Td key={cell.id} className="max-w-72">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
