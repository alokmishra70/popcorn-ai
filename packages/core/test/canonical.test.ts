import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src';
import { hashArgs } from '../src/node';

describe('canonicalJson', () => {
  it('ignores key order, undefined values and padding', () => {
    expect(canonicalJson({ b: 1, a: ' x ', c: undefined })).toBe(canonicalJson({ a: 'x', b: 1 }));
  });

  it('keeps array order', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('hashArgs', () => {
  it('is stable across key order and differs by tool name', () => {
    expect(hashArgs('t', { a: 1, b: 2 })).toBe(hashArgs('t', { b: 2, a: 1 }));
    expect(hashArgs('t', { a: 1 })).not.toBe(hashArgs('u', { a: 1 }));
  });
});
