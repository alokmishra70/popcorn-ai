import { describe, expect, it } from 'vitest';
import { popcorn, redactors } from '../src';
import { collect, setup } from './helpers';

describe('redaction', () => {
  it('always strips values under auth-like keys', async () => {
    const transport = setup();
    await popcorn.trace('agent', async () => 'ok', {
      input: {
        headers: { Authorization: 'Bearer sk-123', 'x-request-id': 'r1' },
        api_key: 'secret',
      },
    });
    const [root] = await collect(transport);
    expect(root!.input).toEqual({
      headers: { Authorization: '[REDACTED]', 'x-request-id': 'r1' },
      api_key: '[REDACTED]',
    });
  });

  it('masks emails and phone numbers with the built-in redactors', async () => {
    const transport = setup({ redact: [redactors.email, redactors.phone] });
    await popcorn.trace('agent', async () => 'Reply sent to jane.doe@example.com', {
      input: 'Call me on +1 415 555 0134 about order A-1001',
    });
    const [root] = await collect(transport);
    expect(root!.input).toBe('Call me on [PHONE] about order A-1001');
    expect(root!.output).toBe('Reply sent to [EMAIL]');
  });

  it('drops spans when the hook returns null or throws', async () => {
    const transport = setup({ redact: (span) => (span.name === 'secret' ? null : span) });
    await popcorn.trace('secret', async () => 1);
    await popcorn.trace('public', async () => 2);
    expect((await collect(transport)).map((s) => s.name)).toEqual(['public']);
  });
});
