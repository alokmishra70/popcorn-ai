'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

export const THEME_STORAGE_KEY = 'popcorn-theme';

/** Inline script for <head>: applies the stored or system theme before first paint. */
export const themeScript = `(() => {
  try {
    const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    const dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
})();`;

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page.
    }
    setDark(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
