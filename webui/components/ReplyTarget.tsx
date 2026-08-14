'use client';

import { useEffect } from 'react';
import { replyAnchor } from '@/lib/directories';

/** Scroll a reply permalink route to the reply it identifies. */
export function ReplyTarget({ cid }: { cid?: string }) {
  useEffect(() => {
    if (!cid) return;
    document.getElementById(replyAnchor(cid))?.scrollIntoView({ block: 'start' });
  }, [cid]);

  return null;
}
