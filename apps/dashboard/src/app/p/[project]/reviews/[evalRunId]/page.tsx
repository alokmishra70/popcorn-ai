import { compareEvalRuns, formatDuration, formatUsd } from '@popcornai/core';
import { findBaselineEvalRun, getEvalRun, toEvalOutcome } from '@popcornai/db';
import { Check, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EvalComparisonView } from '@/components/eval-comparison';
import { JudgeVerdict } from '@/components/judge-verdict';
import { PageHeader } from '@/components/page-header';
import { Stars } from '@/components/stars';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime, shortId } from '@/lib/utils';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Review' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ project: string; evalRunId: string }>;
}) {
  const { project: slug, evalRunId } = await params;
  if (!UUID.test(evalRunId)) notFound();
  const project = await requireProject(slug);
  const detail = await getEvalRun(db, project.id, evalRunId);
  if (!detail) notFound();

  const { evalRun, dataset, results } = detail;
  const baselineRun = await findBaselineEvalRun(db, evalRun.datasetId, 'main', evalRun.id);
  const baseline = baselineRun ? await getEvalRun(db, project.id, baselineRun.id) : null;
  const comparison = compareEvalRuns(
    toEvalOutcome(detail),
    baseline ? toEvalOutcome(baseline) : null,
  );
  const flaky = new Set(detail.cases.filter((c) => c.flaky).map((c) => c.testCaseId));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {dataset.name} <Stars passRate={evalRun.passRate} className="text-lg" />
            <span className="text-base font-normal text-muted tabular-nums">
              {evalRun.passed}/{evalRun.total}
            </span>
          </span>
        }
        subtitle={
          <>
            {formatDateTime(evalRun.startedAt)}
            {evalRun.gitBranch ? ` · ${evalRun.gitBranch}` : ''}
            {evalRun.gitSha ? ` @ ${evalRun.gitSha.slice(0, 7)}` : ''}
            {evalRun.model ? ` · ${evalRun.model}` : ''}
            {evalRun.promptHash ? ` · prompt ${evalRun.promptHash}` : ''}
            {` · ${formatUsd(evalRun.costUsd)} total`}
          </>
        }
      />
      <EvalComparisonView
        comparison={comparison}
        baselineLabel={
          baselineRun
            ? `main @ ${baselineRun.gitSha?.slice(0, 7) ?? shortId(baselineRun.id)}`
            : 'main'
        }
      />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          {evalRun.repeat > 1 ? (
            <span className="text-xs text-muted">each case run {evalRun.repeat} times</span>
          ) : null}
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Case</Th>
              <Th>Result</Th>
              <Th>Checks</Th>
              <Th className="text-right">Time</Th>
              <Th className="text-right">Cost</Th>
              <Th>Trace</Th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              return (
                <Tr key={result.id} className="align-top">
                  <Td className="max-w-72">
                    <p className="truncate font-medium">{result.testCaseName}</p>
                    <span className="flex gap-1">
                      {evalRun.repeat > 1 ? (
                        <span className="text-xs text-muted">attempt {result.attempt + 1}</span>
                      ) : null}
                      {flaky.has(result.testCaseId) ? <Badge tone="warn">flaky</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    {result.passed ? (
                      <Badge tone="ok">pass</Badge>
                    ) : (
                      <Badge tone="danger">fail</Badge>
                    )}
                  </Td>
                  <Td className="max-w-xl">
                    <ul className="flex flex-col gap-1">
                      {result.checkResults.map((check, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          {check.skipped ? (
                            <span className="mt-0.5 size-3.5 shrink-0 text-center text-muted">
                              -
                            </span>
                          ) : check.passed ? (
                            <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                          ) : (
                            <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                          )}
                          <span className={check.skipped ? 'text-muted' : undefined}>
                            {check.name}
                            {check.reason && (!check.passed || check.type === 'llm_judge') ? (
                              <span className="text-muted"> — {check.reason}</span>
                            ) : null}
                          </span>
                          {check.type === 'llm_judge' && !check.skipped ? (
                            <JudgeVerdict
                              project={project.slug}
                              evalRunId={evalRun.id}
                              resultId={result.id}
                              correct={result.judgeVerdictCorrect}
                              readOnly={env.readOnly}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td className="text-right tabular-nums">{formatDuration(result.durationMs)}</Td>
                  <Td className="text-right tabular-nums">{formatUsd(result.costUsd)}</Td>
                  <Td>
                    {result.runId ? (
                      <Link
                        className="font-mono text-xs hover:text-brand"
                        href={`/p/${project.slug}/runs/${result.runId}`}
                      >
                        {shortId(result.runId)}
                      </Link>
                    ) : null}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
