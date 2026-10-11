'use client';

import { KeyRound } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createApiKeyAction, revokeApiKeyAction } from '@/server/actions';
import { timeAgo } from '@/lib/utils';
import { CopyButton } from './copy-button';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, Td, Th, Tr } from './ui/table';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** FR-5.4: create and revoke ingest keys. A new key is shown once; only its hash is stored. */
export function ApiKeys({
  project,
  apiUrl,
  keys,
}: {
  project: string;
  apiUrl: string;
  keys: KeyRow[];
}) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createApiKeyAction(project, name);
      if (result.ok) {
        setCreated(result.data.key);
        setName('');
      }
    });

  const revoke = (id: string) => {
    if (!confirm('Revoke this key? Agents using it will stop sending traces within seconds.'))
      return;
    startTransition(async () => {
      await revokeApiKeyAction(project, id);
    });
  };

  const snippet = created ? `POPCORN_ENDPOINT=${apiUrl}\nPOPCORN_API_KEY=${created}` : '';

  return (
    <div className="flex flex-col">
      <form
        className="flex gap-2 border-b p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. production or ci"
          aria-label="Key name"
        />
        <Button type="submit" variant="primary" disabled={pending}>
          <KeyRound /> Create key
        </Button>
      </form>
      {created ? (
        <div className="border-b bg-ok-soft/50 p-4 text-sm">
          <p className="mb-2 font-medium">Copy this key now. It will not be shown again.</p>
          <div className="flex items-start gap-2 rounded-md border bg-surface p-2 font-mono text-xs">
            <pre className="flex-1 overflow-x-auto">{snippet}</pre>
            <CopyButton text={snippet} label="Copy key" />
          </div>
        </div>
      ) : null}
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Key</Th>
            <Th>Created</Th>
            <Th>Last used</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <Tr key={key.id}>
              <Td>{key.name}</Td>
              <Td className="font-mono text-xs">{key.prefix}...</Td>
              <Td className="text-xs text-muted">{timeAgo(key.createdAt)}</Td>
              <Td className="text-xs text-muted">
                {key.lastUsedAt ? timeAgo(key.lastUsedAt) : 'never'}
              </Td>
              <Td className="text-right">
                {key.revokedAt ? (
                  <Badge>revoked</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => revoke(key.id)}
                    disabled={pending}
                  >
                    Revoke
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
