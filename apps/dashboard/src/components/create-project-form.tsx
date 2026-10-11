'use client';

import { useActionState, useState } from 'react';
import { createProjectAction } from '@/server/actions';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="Support bot"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          placeholder="support-bot"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
        />
      </div>
      {state && !state.ok ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Creating...' : 'Create project'}
      </Button>
    </form>
  );
}
