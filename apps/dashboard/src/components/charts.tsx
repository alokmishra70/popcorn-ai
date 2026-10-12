'use client';

import { formatDuration, formatUsd } from '@popcornai/core';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface DailyPoint {
  day: string;
  runs: number;
  errors: number;
  errorRate: number;
  p50Ms: number | null;
  p95Ms: number | null;
  costUsd: number;
}

const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;
const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--muted)' },
};
const shortDay = (day: string) => day.slice(5);

export function RunsChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--surface-muted)' }} />
        <Bar
          isAnimationActive={false}
          dataKey="runs"
          name="Runs"
          stackId="r"
          fill="var(--chart-2)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          isAnimationActive={false}
          dataKey="errors"
          name="Errors"
          stackId="e"
          fill="var(--chart-1)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ErrorRateChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          domain={[0, (max: number) => Math.max(max, 0.05)]}
          {...axis}
        />
        <Tooltip {...tooltipStyle} formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
        <Area
          isAnimationActive={false}
          type="monotone"
          dataKey="errorRate"
          name="Error rate"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.15}
          dot={{ r: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} />
        <YAxis tickFormatter={(v: number) => formatDuration(v)} {...axis} width={56} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => formatDuration(v)} />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="p50Ms"
          name="p50"
          stroke="var(--chart-2)"
          dot={{ r: 2.5 }}
          strokeWidth={2}
          connectNulls
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="p95Ms"
          name="p95"
          stroke="var(--chart-3)"
          dot={{ r: 2.5 }}
          strokeWidth={2}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} />
        <YAxis tickFormatter={(v: number) => formatUsd(v)} {...axis} width={56} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => formatUsd(v)}
          cursor={{ fill: 'var(--surface-muted)' }}
        />
        <Bar
          isAnimationActive={false}
          dataKey="costUsd"
          name="Cost"
          fill="var(--chart-4)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
