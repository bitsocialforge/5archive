import { replyAnchor, threadPath } from './directories';
import type { PostView } from './post';

export interface QuoteTarget {
  href: string;
  /** Quoting the thread's OP: 5chan appends " (OP)". */
  op: boolean;
}

/** Resolves ">>N" to a post in this rendering; null when N isn't known here. */
export type ResolveQuote = (number: number) => QuoteTarget | null;

/** Numbers a text quotes inline (5chan's QUOTE_LINK_REGEX), so prepended quotelinks don't repeat them. */
const quotedNumbers = (content: string | null | undefined): Set<number> =>
  new Set([...(content ?? '').matchAll(/(?<![>/\w])>>(\d+)(?![\d/])/g)].map((m) => Number(m[1])));

/**
 * How one rendered thread links to itself: 5chan's quotelinks (">>N"), the
 * quotelinks it prepends to replies, and the backlinks in each post's info line
 * (5chan's useQuotedByMap plus direct children for replies).
 */
export interface ThreadLinks {
  /** Where a link to this post goes: its anchor when it is on this page, else its permalink route. */
  href: (view: PostView) => string;
  resolve: ResolveQuote;
  /** Replies linking to a post, in thread order. */
  backlinks: (cid: string) => PostView[];
  /** Quotelinks 5chan shows above a reply's text, for quotes its text doesn't already spell out. */
  prepended: (reply: PostView) => PostView[];
}

export function threadLinks(op: PostView, replies: PostView[], inPage: Set<string>): ThreadLinks {
  const posts = [op, ...replies];
  const byCid = new Map(posts.map((p) => [p.comment.cid, p]));
  const byNumber = new Map<number, PostView>();
  for (const p of posts) if (p.number !== undefined) byNumber.set(p.number, p);

  const href = (view: PostView) =>
    inPage.has(view.comment.cid) ? `#${replyAnchor(view.comment.cid)}` : threadPath(view.comment);

  const backlinks = new Map<string, PostView[]>();
  const prepended = new Map<string, PostView[]>();
  for (const reply of replies) {
    if (reply.tombstone) continue;
    const inline = quotedNumbers(reply.comment.content);
    const targets = new Set<string>();
    for (const n of inline) {
      const target = byNumber.get(n);
      if (target) targets.add(target.comment.cid);
    }

    const extra: PostView[] = [];
    for (const cid of reply.quotedCids) {
      const target = byCid.get(cid);
      if (!target) continue;
      targets.add(cid);
      if (target.number !== undefined && !inline.has(target.number)) extra.push(target);
    }
    const parent = reply.comment.parent_cid ? byCid.get(reply.comment.parent_cid) : undefined;
    if (parent && parent !== op) {
      targets.add(parent.comment.cid);
      if (extra.length === 0 && parent.number !== undefined && !inline.has(parent.number)) extra.push(parent);
    }
    if (extra.length > 0) prepended.set(reply.comment.cid, extra);

    for (const cid of targets) {
      if (cid === reply.comment.cid) continue;
      const list = backlinks.get(cid);
      if (list) list.push(reply);
      else backlinks.set(cid, [reply]);
    }
  }

  return {
    href,
    resolve: (number) => {
      const target = byNumber.get(number);
      return target ? { href: href(target), op: target === op } : null;
    },
    backlinks: (cid) => backlinks.get(cid) ?? [],
    prepended: (reply) => prepended.get(reply.comment.cid) ?? [],
  };
}
