import { randomUUID } from 'node:crypto';
import {
  SpanAttr,
  checkListSchema,
  collapseAttempts,
  compareEvalRuns,
  computeCost,
  findRootSpan,
  runChecks,
  type CheckResult,
  type CollapsedOutcome,
  type EvalComparison,
  type Judge,
  type SpanPayload,
  type StoredSpan,
} from '@popcorn-ai/core';
import { popcorn } from '@popcorn-ai/sdk';
import pLimit from 'p-limit';
import { ApiClient } from '../api';
import type { PopcornConfig } from '../config';
import { gitInfo } from '../git';

interface TestCaseRecord {
  id: string;
  name: string;
  input: unknown;
  expected: unknown;
  checks: unknown[];
}

interface DatasetResponse {
  dataset: { id: string; name: string; agentName: string | null };
  cases: TestCaseRecord[];
}

interface EvalRunDetailResponse {
  evalRun: { id: string; gitSha: string | null; gitBranch: string | null };
  cases: CollapsedOutcome[];
}

export interface ReviewOptions {
  suite: string;
  config: PopcornConfig;
  judge?: Judge;
  /** Cases run at the same time. Default 4. */
  concurrency?: number;
  /** Run every case this many times to detect flaky cases (FR-4.8). Default 1. */
  repeat?: number;
  /** Branch whose latest eval run is the baseline. Default "main". */
  baselineBranch?: string;
  label?: string;
  /** Store the eval run in Popcorn. Default true. */
  upload?: boolean;
  api?: ApiClient;
  onProgress?: (done: number, total: number) => void;
}

export interface CaseResult {
  testCaseId: string;
  name: string;
  attempt: number;
  runId: string | null;
  passed: boolean;
  checks: CheckResult[];
  costUsd: number;
  durationMs: number;
  error: string | null;
}

export interface ReviewReport {
  suite: string;
  evalRunId: string;
  uploaded: boolean;
  git: { sha: string | null; branch: string | null };
  baseline: { evalRunId: string; sha: string | null; branch: string | null } | null;
  comparison: EvalComparison;
  results: CaseResult[];
  flaky: CollapsedOutcome[];
  totalCostUsd: number;
  durationMs: number;
}

/**
 * Runs an eval suite (FR-4.4): every test case is executed through the real
 * agent with tracing on, checks are applied to the recorded spans, the result is
 * stored as an eval run, and it is compared with the latest run on the baseline
 * branch.
 */
export async function runReview(options: ReviewOptions): Promise<ReviewReport> {
  const api = options.api ?? new ApiClient();
  const repeat = Math.max(1, options.repeat ?? 1);
  const started = new Date();
  const git = gitInfo();
  const evalRunId = randomUUID();

  const { dataset, cases } = await api.get<DatasetResponse>(
    `/v1/datasets/${encodeURIComponent(options.suite)}`,
  );
  if (cases.length === 0) throw new Error(`Suite "${options.suite}" has no test cases`);
  const agentName = resolveAgentName(options.config, dataset.agentName);
  const agent = unwrapAgent(options.config.agents[agentName]!);

  const jobs = cases.flatMap((testCase) =>
    Array.from({ length: repeat }, (_, attempt) => ({ testCase, attempt })),
  );
  const limit = pLimit(Math.max(1, options.concurrency ?? 4));
  let done = 0;

  const results = await Promise.all(
    jobs.map(({ testCase, attempt }) =>
      limit(async () => {
        const result = await runCase(agentName, agent, testCase, attempt, evalRunId, options.judge);
        options.onProgress?.(++done, jobs.length);
        return result;
      }),
    ),
  );
  await popcorn.flush();

  const finished = new Date();
  const collapsed = collapseAttempts(results);

  const upload = options.upload ?? true;
  if (upload) {
    await api.post('/v1/eval-runs', {
      id: evalRunId,
      dataset: dataset.name,
      gitSha: git.sha,
      gitBranch: git.branch,
      label: options.label ?? null,
      model: options.config.metadata?.model ?? null,
      promptHash: options.config.metadata?.prompt ?? null,
      repeat,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      results: results.map((r) => ({
        testCaseId: r.testCaseId,
        runId: r.runId,
        attempt: r.attempt,
        passed: r.passed,
        checkResults: r.checks,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        error: r.error,
      })),
    });
  }

  const branch = options.baselineBranch ?? 'main';
  const baseline = await api.find<EvalRunDetailResponse>(
    `/v1/datasets/${encodeURIComponent(dataset.name)}/eval-runs/latest?branch=${encodeURIComponent(branch)}&exclude=${evalRunId}`,
  );

  return {
    suite: dataset.name,
    evalRunId,
    uploaded: upload,
    git,
    baseline: baseline
      ? {
          evalRunId: baseline.evalRun.id,
          sha: baseline.evalRun.gitSha,
          branch: baseline.evalRun.gitBranch,
        }
      : null,
    comparison: compareEvalRuns(
      { id: evalRunId, cases: collapsed },
      baseline ? { id: baseline.evalRun.id, cases: baseline.cases } : null,
    ),
    results,
    flaky: collapsed.filter((c) => c.flaky),
    totalCostUsd: Math.round(results.reduce((sum, r) => sum + r.costUsd, 0) * 1e6) / 1e6,
    durationMs: finished.getTime() - started.getTime(),
  };
}

type AgentFunction = (input: unknown) => unknown;

function resolveAgentName(config: PopcornConfig, datasetAgent: string | null): string {
  const names = Object.keys(config.agents);
  if (datasetAgent && config.agents[datasetAgent]) return datasetAgent;
  if (!datasetAgent && names.length === 1) return names[0]!;
  throw new Error(
    datasetAgent
      ? `Suite runs agent "${datasetAgent}" but popcorn.config.ts only defines: ${names.join(', ')}`
      : `Suite has no agent recorded; define exactly one agent in popcorn.config.ts`,
  );
}

/** `popcorn.agent()` wrappers carry the raw function; call that so the run isn't traced twice. */
function unwrapAgent(agent: (input: never) => unknown): AgentFunction {
  const raw = (agent as { run?: AgentFunction }).run;
  return raw ?? (agent as AgentFunction);
}

async function runCase(
  agentName: string,
  agent: AgentFunction,
  testCase: TestCaseRecord,
  attempt: number,
  evalRunId: string,
  judge: Judge | undefined,
): Promise<CaseResult> {
  const captured: SpanPayload[] = [];
  let runId: string | null = null;
  const stop = popcorn.onSpanEnd((span) => {
    if (span.runId === runId) captured.push(span);
  });

  let output: unknown;
  let error: string | null = null;
  try {
    output = await popcorn.trace(
      agentName,
      async (span) => {
        runId = span.runId;
        return agent(testCase.input);
      },
      {
        input: testCase.input,
        attributes: { [SpanAttr.EvalRunId]: evalRunId, [SpanAttr.TestCaseId]: testCase.id },
      },
    );
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
  } finally {
    stop();
  }

  const spans: StoredSpan[] = captured.map((s) => ({
    ...s,
    costUsd: s.kind === 'llm' ? computeCost(s.model, s.usage) : null,
  }));
  const parsedChecks = checkListSchema.safeParse(testCase.checks);
  const checks: CheckResult[] = parsedChecks.success
    ? await runChecks(
        parsedChecks.data,
        { spans, output, input: testCase.input, expected: testCase.expected },
        judge,
      )
    : [
        {
          name: 'checks are valid',
          type: 'checks_valid',
          passed: false,
          reason: parsedChecks.error.message,
        },
      ];

  if (error)
    checks.unshift({ name: 'run completed', type: 'run_completed', passed: false, reason: error });

  const root = findRootSpan(spans);
  return {
    testCaseId: testCase.id,
    name: testCase.name,
    attempt,
    runId,
    passed: checks.every((c) => c.passed),
    checks,
    costUsd: Math.round(spans.reduce((sum, s) => sum + (s.costUsd ?? 0), 0) * 1e6) / 1e6,
    durationMs: root ? root.endTime - root.startTime : 0,
    error,
  };
}
