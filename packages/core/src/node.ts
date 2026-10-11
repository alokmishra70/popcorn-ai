import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical';

/** Fixture key for a tool call: sha256 over the tool name and its canonical arguments. */
export function hashArgs(toolName: string, args: unknown): string {
  return createHash('sha256')
    .update(toolName)
    .update('\u0000')
    .update(canonicalJson(args))
    .digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
