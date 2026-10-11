#!/usr/bin/env node
import { RUN_FLAGS, RUN_STATUSES } from '@popcorn-ai/core';
import {
  ApiClient,
  loadConfig,
  renderMarkdown,
  runReview,
  createAnthropicJudge,
} from '@popcorn-ai/cli';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pkg from '../package.json';
import { getRun, searchRuns } from './tools';

/**
 * Popcorn as an MCP server (FR-5.7). Reads POPCORN_ENDPOINT and POPCORN_API_KEY.
 *
 *   claude mcp add popcorn -- npx @popcorn-ai/mcp
 */
const api = new ApiClient();
const server = new McpServer({ name: 'popcorn', version: pkg.version });

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (error: unknown) => ({
  content: [
    { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
  ],
  isError: true,
});

server.registerTool(
  'search_runs',
  {
    title: 'Search agent runs',
    description:
      'Find recorded agent runs, newest first. Filter by full-text query over inputs and outputs, status, anomaly flag or agent name. Returns one line per run with its id.',
    inputSchema: {
      query: z.string().optional().describe('Words to search for in run inputs and outputs'),
      status: z.enum(RUN_STATUSES).optional(),
      flag: z.enum(RUN_FLAGS).optional().describe('error, loop, cost_spike or max_steps'),
      name: z.string().optional().describe('Agent name, partial match'),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    try {
      return text(await searchRuns(api, args));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'get_run',
  {
    title: 'Get one run',
    description:
      'Show a run step by step: every model and tool call with its arguments, result and errors. Use after search_runs.',
    inputSchema: { runId: z.string().uuid() },
    annotations: { readOnlyHint: true },
  },
  async ({ runId }) => {
    try {
      return text(await getRun(api, runId));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'run_eval',
  {
    title: 'Run an eval suite',
    description:
      'Run a Popcorn eval suite against the agent defined in popcorn.config.ts in the current directory, store the result and compare it with the latest run on main. Calls the real model and costs money.',
    inputSchema: {
      suite: z.string().describe('Dataset name, e.g. support-v1'),
      configPath: z
        .string()
        .optional()
        .describe('Path to popcorn.config.ts, if not in the working directory'),
      repeat: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('Run each case this many times to find flaky cases'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ suite, configPath, repeat }) => {
    try {
      const { config } = await loadConfig(configPath);
      const judge =
        config.judge?.enabled === false
          ? undefined
          : createAnthropicJudge({ model: config.judge?.model });
      const report = await runReview({ suite, config, judge, repeat, api });
      return text(renderMarkdown(report));
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
