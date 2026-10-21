import { isRecord } from './api-contract.ts';
import type { Comment } from './types.ts';

type Json = Record<string, unknown>;

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export const parseRaw = (raw: string | null | undefined): { comment: Json; update: Json } => {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        return {
          comment: isRecord(parsed.comment) ? parsed.comment : {},
          update: isRecord(parsed.commentUpdate) ? parsed.commentUpdate : {},
        };
      }
    } catch {
      // Unparseable bookkeeping is not worth failing a page over.
    }
  }
  return { comment: {}, update: {} };
};

/**
 * cid → post number for the replies preloaded in an OP's CommentUpdate. Only
 * those two fields are read: the pages are not redacted, so nothing else in
 * them may reach a page. A redacted reply's own raw is null, so this is where
 * its number survives.
 */
export function embeddedNumbers(op: Pick<Comment, 'raw'>): Map<string, number> {
  const numbers = new Map<string, number>();
  const walk = (update: Json | undefined, depth: number) => {
    const replies = update?.replies;
    const pages = isRecord(replies) ? replies.pages : undefined;
    if (!isRecord(pages) || depth > 50) return;
    for (const page of Object.values(pages)) {
      if (!isRecord(page) || !Array.isArray(page.comments)) continue;
      for (const reply of page.comments) {
        const nested = isRecord(reply) && isRecord(reply.commentUpdate) ? reply.commentUpdate : undefined;
        const cid = nested?.cid;
        const number = positive(nested?.number);
        if (typeof cid === 'string' && number !== undefined) numbers.set(cid, number);
        walk(nested, depth + 1);
      }
    }
  };
  walk(parseRaw(op.raw).update, 0);
  return numbers;
}
