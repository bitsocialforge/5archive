import type { Comment } from '@/lib/types';

/**
 * Placeholder body for removed/deleted/taken-down comments: the API serves
 * them with all content fields nulled, so only the fact (and optional mod
 * reason) is shown. Thread structure is preserved — the row still occupies
 * its slot. Operator takedowns show the marker alone: takedown_reason is
 * operator bookkeeping, not public copy.
 */
/**
 * The placeholder a redacted comment renders. Split out so the structured data
 * quotes the same string the page shows — markup that describes content the
 * reader can't see is exactly what Google's visible-content rule prohibits.
 */
export function tombstoneText(comment: Comment): string {
  if (comment.takedown) return '[removed — takedown request]';
  const label = comment.removed ? '[removed by moderator]' : '[deleted by author]';
  return comment.mod_reason ? `${label} — ${comment.mod_reason}` : label;
}

export function Tombstone({ comment }: { comment: Comment }) {
  return <p className="prose tombstone">{tombstoneText(comment)}</p>;
}

/** True when the API redacted this comment into a tombstone. */
export function isTombstone(c: Comment): boolean {
  return Boolean(c.removed || c.deleted || c.takedown);
}
