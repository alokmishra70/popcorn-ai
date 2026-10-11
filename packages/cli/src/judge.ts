import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { Judge, JudgeRequest, JudgeVerdict } from '@popcorn-ai/core';

export const DEFAULT_JUDGE_MODEL = 'claude-haiku-5-5';

const JUDGE_SYSTEM = `You grade the output of an AI agent against a rubric.
Read the rubric, the input the agent received, the expected outcome if one is given, and the agent's output.
Decide whether the output satisfies the rubric. Judge only what the rubric asks about.
Give a one or two sentence reason that names the specific part of the output that decided it.`;

/** Changes whenever the judge prompt changes, so verdicts from different prompts are never compared blindly. */
export const JUDGE_PROMPT_VERSION = createHash('sha256')
  .update(JUDGE_SYSTEM)
  .digest('hex')
  .slice(0, 12);

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['passed', 'reason'],
  additionalProperties: false,
};

const render = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

export interface AnthropicJudgeOptions {
  model?: string;
  client?: Anthropic;
  /** File used to cache verdicts between runs. Identical inputs are not judged twice. */
  cacheFile?: string;
}

/**
 * LLM-as-judge for `llm_judge` checks (FR-4.3). Uses structured output so the
 * verdict always parses, and records the judge model and prompt version with
 * every result.
 */
export function createAnthropicJudge(options: AnthropicJudgeOptions = {}): Judge {
  const client = options.client ?? new Anthropic();
  const defaultModel = options.model ?? DEFAULT_JUDGE_MODEL;
  const cache = new VerdictCache(
    options.cacheFile ?? join(process.cwd(), 'node_modules', '.cache', 'popcorn', 'judge.json'),
  );

  return async (request: JudgeRequest): Promise<JudgeVerdict> => {
    const model = request.model ?? defaultModel;
    const prompt = [
      `<rubric>\n${request.rubric}\n</rubric>`,
      `<input>\n${render(request.input)}\n</input>`,
      request.expected !== undefined && request.expected !== null
        ? `<expected>\n${render(request.expected)}\n</expected>`
        : '',
      `<output>\n${render(request.output)}\n</output>`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const key = createHash('sha256')
      .update(`${model}\0${JUDGE_PROMPT_VERSION}\0${prompt}`)
      .digest('hex');
    const cached = cache.get(key);
    if (cached) return cached;

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal')
      throw new Error('judge model declined to grade this output');
    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('judge returned no verdict');

    const parsed = JSON.parse(text.text) as { passed: boolean; reason: string };
    const verdict: JudgeVerdict = {
      passed: parsed.passed === true,
      reason: String(parsed.reason ?? ''),
      model: response.model,
      promptVersion: JUDGE_PROMPT_VERSION,
    };
    cache.set(key, verdict);
    return verdict;
  };
}

class VerdictCache {
  private entries: Record<string, JudgeVerdict> | null = null;

  constructor(private readonly file: string) {}

  get(key: string): JudgeVerdict | undefined {
    return this.load()[key];
  }

  set(key: string, verdict: JudgeVerdict): void {
    this.load()[key] = verdict;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.entries));
    } catch {
      // A read-only checkout just means no cache.
    }
  }

  private load(): Record<string, JudgeVerdict> {
    if (this.entries) return this.entries;
    try {
      this.entries = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, JudgeVerdict>;
    } catch {
      this.entries = {};
    }
    return this.entries;
  }
}
