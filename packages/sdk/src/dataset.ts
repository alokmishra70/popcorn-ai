import type { CheckInput } from '@popcorn-ai/core';
import { apiRequest } from './api-client';

export interface AddTestCaseOptions {
  /** Dataset (suite) name. Created if it does not exist. */
  dataset: string;
  /** Display name for the case. Defaults to the run name and a short id. */
  name?: string;
  /** The expected outcome, shown to the LLM judge and kept for reference. */
  expected?: unknown;
  /** Checks to run against this case. */
  checks?: CheckInput[];
}

export interface TestCaseRef {
  id: string;
  datasetId: string;
  name: string;
}

/**
 * Saves a recorded run as a test case (FR-4.1). The run's input becomes the case
 * input, so the eval runner can re-run the agent on it.
 *
 * @example
 * await popcorn.dataset.add(runId, {
 *   dataset: 'support-v1',
 *   expected: { category: 'refund' },
 *   checks: [{ type: 'output_equals', path: 'category', value: 'refund' }],
 * });
 */
async function add(runId: string, options: AddTestCaseOptions): Promise<TestCaseRef> {
  return apiRequest<TestCaseRef>(
    'POST',
    `/v1/datasets/${encodeURIComponent(options.dataset)}/cases`,
    {
      sourceRunId: runId,
      name: options.name,
      expected: options.expected,
      checks: options.checks ?? [],
    },
  );
}

export const dataset = { add };
