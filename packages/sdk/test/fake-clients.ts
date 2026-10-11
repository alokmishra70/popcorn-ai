type Params = Record<string, unknown>;

export function anthropicMessage(text: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 50 },
    ...overrides,
  };
}

/** Mimics the slice of the Anthropic client the wrapper touches. */
export class FakeAnthropic {
  readonly calls: Params[] = [];
  private readonly replies: string[];

  constructor(replies: string[] = ['hello']) {
    this.replies = [...replies];
  }

  messages = {
    create: async (params: Params) => {
      this.calls.push(params);
      if (params.model === 'broken') throw Object.assign(new Error('overloaded'), { status: 529 });
      const text = this.replies.shift() ?? 'done';
      if (!params.stream) return anthropicMessage(text, { model: params.model });
      return streamOf([
        {
          type: 'message_start',
          message: {
            ...anthropicMessage(''),
            content: [],
            usage: { input_tokens: 80, output_tokens: 1 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text.slice(0, 2) },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text.slice(2) },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 't1', name: 'lookup', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"orderId":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '"A-1"}' },
        },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 25 } },
        { type: 'message_stop' },
      ]);
    },
  };
}

export function streamOf<T>(events: T[]) {
  return {
    controller: new AbortController(),
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

export class FakeOpenAI {
  chat = {
    completions: {
      create: async (params: Params) => {
        if (!params.stream) {
          return {
            model: 'gpt-4o-2024-08-06',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 10,
              prompt_tokens_details: { cached_tokens: 40 },
            },
          };
        }
        return streamOf([
          { model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant', content: 'He' } }] },
          {
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'c1',
                      type: 'function',
                      function: { name: 'lookup', arguments: '{"id"' },
                    },
                  ],
                },
              },
            ],
          },
          {
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: {
                  content: 'llo',
                  tool_calls: [{ index: 0, function: { arguments: ':1}' } }],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
          { model: 'gpt-4o', choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } },
        ]);
      },
    },
  };
}
