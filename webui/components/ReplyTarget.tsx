'use client';

import { useEffect } from 'react';
import { replyAnchor } from '@/lib/directories';

/**
 * Posts render twice, a desktop and a mobile copy, and CSS hides one. Ids sit
 * on the desktop copy; the mobile copy carries the same value as data-anchor.
 * Scroll to whichever copy is showing.
 */
function scrollToAnchor(anchor: string) {
  const element = document.getElementById(anchor);
  const visible = element?.offsetParent ? element : document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`);
  visible?.scrollIntoView({ block: 'start' });
}

/** Scroll a reply permalink route to the reply it identifies. */
export function ReplyTarget({ cid }: { cid?: string }) {
  useEffect(() => {
    if (!cid) return;
    scrollToAnchor(replyAnchor(cid));
  }, [cid]);

  return null;
}

/** Make in-page quotelinks (#p<cid>) land on the visible copy on mobile too. */
export function AnchorScroll() {
  useEffect(() => {
    const onHash = () => {
      let anchor = window.location.hash.slice(1);
      try {
        anchor = decodeURIComponent(anchor);
      } catch {
        // A malformed escape is just an id that matches nothing.
      }
      if (anchor) scrollToAnchor(anchor);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return null;
}

// Keep the scenario's component identity stable in minified profiling builds.
if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_REACT_PERF === '1') {
  ReplyTarget.displayName = 'ReplyTarget';
  AnchorScroll.displayName = 'AnchorScroll';
}
