import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import type { ReactNode } from 'react';
import '@/styles/themes.css';
import './globals.css';
import { DevTools } from '@/components/DevTools';
import { PerfBoundary } from '@/components/PerfBoundary';
import { siteDescription as description, siteName, siteTitle, siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: `%s · ${siteName}` },
  description,
  openGraph: { siteName: siteTitle, type: 'website', title: siteTitle, description },
  twitter: { card: 'summary' },
};

/**
 * No chrome here: like 5chan, the home page and the board pages carry
 * different chrome, and each page wraps itself in its theme (ThemeRoot).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DevTools />
        <PerfBoundary>{children}</PerfBoundary>
        <Analytics />
      </body>
    </html>
  );
}
