import { defineConfig } from '@popcorn-ai/cli';
import { createHash } from 'node:crypto';
import { model, supportTriage, systemPrompt } from './src/index';

export default defineConfig({
  agents: {
    [supportTriage.agentName]: supportTriage,
  },
  judge: {
    model: 'claude-haiku-5-5',
    // The offline demo has no API key for the judge; judge checks are skipped there.
    enabled: process.env.SUPPORT_AGENT_OFFLINE !== 'true',
  },
  metadata: {
    model,
    prompt: createHash('sha256').update(systemPrompt).digest('hex').slice(0, 12),
  },
});
