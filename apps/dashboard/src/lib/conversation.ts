import { findRootSpan, type StoredSpan } from '@popcorn-ai/core';

export type ChatItem =
  | { kind: 'system'; text: string }
  | { kind: 'message'; role: 'user' | 'assistant'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_call'; id: string | null; name: string; input: unknown }
  | {
      kind: 'tool_result';
      id: string | null;
      name: string | null;
      output: unknown;
      isError: boolean;
    };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (isObject(part) && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Anthropic: content is a string or a list of typed blocks. */
function anthropicItems(
  role: string,
  content: unknown,
  toolNames: Map<string, string>,
): ChatItem[] {
  if (typeof content === 'string') {
    return content
      ? [{ kind: 'message', role: role === 'assistant' ? 'assistant' : 'user', text: content }]
      : [];
  }
  if (!Array.isArray(content)) return [];

  const items: ChatItem[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text.trim()) {
          items.push({
            kind: 'message',
            role: role === 'assistant' ? 'assistant' : 'user',
            text: block.text,
          });
        }
        break;
      case 'thinking':
        if (typeof block.thinking === 'string' && block.thinking.trim())
          items.push({ kind: 'thinking', text: block.thinking });
        break;
      case 'tool_use': {
        const id = typeof block.id === 'string' ? block.id : null;
        const name = String(block.name ?? 'tool');
        if (id) toolNames.set(id, name);
        items.push({ kind: 'tool_call', id, name, input: block.input });
        break;
      }
      case 'tool_result': {
        const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : null;
        const raw = typeof block.content === 'string' ? block.content : textOf(block.content);
        items.push({
          kind: 'tool_result',
          id,
          name: id ? (toolNames.get(id) ?? null) : null,
          output: parseMaybeJson(raw),
          isError: block.is_error === true,
        });
        break;
      }
    }
  }
  return items;
}

/** OpenAI chat: role-tagged messages, tool calls on assistant messages, results as role "tool". */
function openAiItems(message: Json, toolNames: Map<string, string>): ChatItem[] {
  const role = String(message.role);
  if (role === 'system' || role === 'developer')
    return [{ kind: 'system', text: textOf(message.content) }];
  if (role === 'tool') {
    const id = typeof message.tool_call_id === 'string' ? message.tool_call_id : null;
    return [
      {
        kind: 'tool_result',
        id,
        name: id ? (toolNames.get(id) ?? null) : null,
        output: parseMaybeJson(textOf(message.content)),
        isError: false,
      },
    ];
  }
  const items: ChatItem[] = [];
  const text = textOf(message.content);
  if (text)
    items.push({ kind: 'message', role: role === 'assistant' ? 'assistant' : 'user', text });
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    if (!isObject(call) || !isObject(call.function)) continue;
    const id = typeof call.id === 'string' ? call.id : null;
    const name = String(call.function.name ?? 'tool');
    if (id) toolNames.set(id, name);
    const args = call.function.arguments;
    items.push({
      kind: 'tool_call',
      id,
      name,
      input: typeof args === 'string' ? parseMaybeJson(args) : args,
    });
  }
  return items;
}

/**
 * The run's message thread (FR-2.2). The last successful model call carries the
 * whole history in its input; its response is appended to finish the thread.
 */
export function buildConversation(spans: readonly StoredSpan[]): ChatItem[] {
  const llmSpans = spans
    .filter((s) => s.kind === 'llm' && s.status === 'ok')
    .sort((a, b) => a.startTime - b.startTime);
  const last = llmSpans[llmSpans.length - 1];

  if (!last || !isObject(last.input)) {
    const root = findRootSpan(spans);
    if (!root) return [];
    const items: ChatItem[] = [];
    if (root.input !== undefined)
      items.push({ kind: 'message', role: 'user', text: stringify(root.input) });
    if (root.output !== undefined)
      items.push({ kind: 'message', role: 'assistant', text: stringify(root.output) });
    return items;
  }

  const toolNames = new Map<string, string>();
  const items: ChatItem[] = [];
  const input = last.input;
  const messages = Array.isArray(input.messages) ? input.messages.filter(isObject) : [];
  const isOpenAi = last.provider === 'openai';

  if (!isOpenAi && input.system !== undefined) {
    const system = textOf(input.system) || (typeof input.system === 'string' ? input.system : '');
    if (system) items.push({ kind: 'system', text: system });
  }
  if (isOpenAi && typeof input.instructions === 'string')
    items.push({ kind: 'system', text: input.instructions });

  for (const message of messages) {
    items.push(
      ...(isOpenAi
        ? openAiItems(message, toolNames)
        : anthropicItems(String(message.role), message.content, toolNames)),
    );
  }

  const output = last.output;
  if (isObject(output)) {
    if (Array.isArray(output.content))
      items.push(...anthropicItems('assistant', output.content, toolNames));
    else if (
      Array.isArray(output.choices) &&
      isObject(output.choices[0]) &&
      isObject(output.choices[0].message)
    ) {
      items.push(...openAiItems(output.choices[0].message, toolNames));
    }
  }
  return items;
}

const stringify = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);
