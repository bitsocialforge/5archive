import Link from 'next/link';
import { brandText, brandUrl, upstreamName, upstreamUrl } from '@/lib/site';
import { hasUpstream } from '@/lib/upstream';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        {/* Says what this site is on every page — the one line a search visitor
            needs to understand they've landed on the archive, not the network. */}
        {hasUpstream ? (
          <span>
            The permanent archive of <a href={upstreamUrl}>{upstreamName}</a>.
          </span>
        ) : (
          <span>A neutral indexer for the Bitsocial network.</span>
        )}
        {brandText ? (
          <span className="brand-line">
            {brandUrl ? (
              <a href={brandUrl} rel="noopener noreferrer">{brandText}</a>
            ) : (
              brandText
            )}
          </span>
        ) : null}
        <span>
          <Link href="/legal">Legal</Link> · Open source ·{' '}
          <a href="https://github.com/bitsocialforge/5archive">GPL-3.0-or-later</a>
        </span>
      </div>
    </footer>
  );
}
