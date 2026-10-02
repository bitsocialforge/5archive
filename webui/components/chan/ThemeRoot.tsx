import type { ReactNode } from 'react';
import type { Theme } from '@/lib/theme';

/** Carries the theme class 5chan puts on <body>; see app/globals.css. */
export function ThemeRoot({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <div className={theme}>{children}</div>;
}
