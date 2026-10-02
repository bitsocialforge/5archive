import type { Comment } from '@/lib/types';
import styles from '@/styles/5chan/post.module.css';

/**
 * Removed/deleted/taken-down comments: the API serves them with every content
 * field nulled, so only the fact (and optional mod reason) is shown, in 5chan's
 * wording. Thread structure is preserved — the row keeps its slot. Operator
 * takedowns show the marker alone: takedown_reason is operator bookkeeping,
 * not public copy.
 */

/**
 * The placeholder a redacted comment renders, as one string. Split out so the
 * structured data quotes the same text the page shows — markup that describes
 * content the reader can't see is exactly what Google's visible-content rule
 * prohibits.
 */
export function tombstoneText(comment: Comment): string {
  if (comment.takedown) return 'This post was removed following a takedown request.';
  if (comment.removed) return comment.mod_reason ? `(this post was removed) Reason: ${comment.mod_reason}` : 'This post was removed.';
  return comment.mod_reason ? `User deleted this post. Reason: ${comment.mod_reason}` : 'User deleted this post.';
}

/** 5chan's CommentContent for a redacted post. */
export function Tombstone({ comment }: { comment: Comment }) {
  if (comment.removed && !comment.takedown && comment.mod_reason) {
    return (
      <>
        <span className={styles.redEditMessage}>(this post was removed)</span>
        <br />
        <br />
        Reason: {comment.mod_reason}
      </>
    );
  }
  if (comment.deleted && !comment.takedown && !comment.removed && comment.mod_reason) {
    return (
      <>
        <span className={styles.grayEditMessage}>User deleted this post.</span> Reason: {comment.mod_reason}
      </>
    );
  }
  return <span className={styles.grayEditMessage}>{tombstoneText(comment)}</span>;
}

/** True when the API redacted this comment into a tombstone. */
export function isTombstone(c: Comment): boolean {
  return Boolean(c.removed || c.deleted || c.takedown);
}
