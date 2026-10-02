import { getThread } from './api';
import { embeddedNumbers, postView, type PostView } from './post';
import { threadLinks, type ThreadLinks } from './thread';
import type { Comment } from './types';

/** 5chan shows a board's threads 15 to a page… */
export const THREADS_PER_PAGE = 15;
/** …each with its last 5 replies. */
export const PREVIEW_REPLIES = 5;

export interface ThreadPreview {
  op: PostView;
  replies: PostView[];
  links: ThreadLinks;
  totalReplies: number;
  totalLinks: number;
}

/**
 * Board-page threads with 5chan's reply previews. Each thread's replies come
 * from its own (cached) thread fetch — the same one its thread page makes —
 * never from the OP's embedded reply pages (see lib/post.ts). A thread whose
 * fetch fails still lists, without its preview.
 */
export async function threadPreviews(posts: Comment[]): Promise<ThreadPreview[]> {
  const threads = await Promise.all(posts.map((post) => (post.reply_count > 0 ? getThread(post.cid) : null)));

  return posts.map((post, index) => {
    const op = postView(post);
    const numbers = embeddedNumbers(post);
    const all = (threads[index]?.replies ?? []).map((reply) => postView(reply, numbers));
    const replies = all.slice(-PREVIEW_REPLIES);
    const inPage = new Set([post.cid, ...replies.map((r) => r.comment.cid)]);
    return {
      op,
      replies,
      links: threadLinks(op, all, inPage),
      totalReplies: threads[index] ? all.length : post.reply_count,
      totalLinks: all.filter((r) => r.media).length,
    };
  });
}

/** Search hits and other single posts, shown without replies. */
export function standalone(post: Comment): ThreadPreview {
  const op = postView(post);
  return { op, replies: [], links: threadLinks(op, [], new Set([post.cid])), totalReplies: 0, totalLinks: 0 };
}
