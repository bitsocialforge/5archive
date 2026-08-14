import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Prose } from '@/components/Prose';
import { ReplyTarget } from '@/components/ReplyTarget';
import { isTombstone, Tombstone } from '@/components/Tombstone';
import { getThread } from '@/lib/api';
import { boardPath, replyAnchor, segmentForAddress, threadPath } from '@/lib/directories';
import { excerpt, timeAgo } from '@/lib/format';
import type { Comment, Thread } from '@/lib/types';

// Threads are archived content: cache the page, revalidate for late replies.
export const revalidate = 5;

type Params = { params: Promise<{ dir: string; cid: string }> };

function threadTitle(post: Comment): string {
  if (post.takedown || post.removed) return '[removed]';
  if (post.deleted) return '[deleted]';
  return post.title || excerpt(post.content, 70) || 'untitled';
}

/**
 * Resolve `/<dir>/thread/<cid>`. Like 5chan, the cid may be a reply. Keep that
 * reply cid in the URL while rendering its root thread and targeting the reply.
 * A cid reached under the wrong directory segment redirects to its own board.
 */
async function loadThread(cid: string): Promise<{ requestedPost: Comment; targetReplyCid?: string; thread: Thread } | null> {
  const requestedThread = await getThread(cid);
  if (!requestedThread) return null;

  const requestedPost = requestedThread.post;
  if (requestedPost.cid === requestedPost.post_cid) {
    return { requestedPost, thread: requestedThread };
  }

  const rootThread = await getThread(requestedPost.post_cid);
  if (!rootThread) return null;

  return { requestedPost, targetReplyCid: requestedPost.cid, thread: rootThread };
}

async function resolveThread(segment: string, cid: string) {
  const resolved = await loadThread(cid);
  if (!resolved) notFound();

  if (segment !== segmentForAddress(resolved.requestedPost.community_address)) {
    permanentRedirect(threadPath(resolved.requestedPost));
  }
  return resolved;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { cid } = await params;
  const resolved = await loadThread(decodeURIComponent(cid));
  if (!resolved) return { title: 'Thread not found', robots: { index: false } };

  const { requestedPost, thread } = resolved;
  const { post } = thread;
  const title = threadTitle(post);
  const description =
    excerpt(post.content) || `A thread from ${post.community_address} with ${post.reply_count} replies.`;
  const canonical = threadPath(requestedPost);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      publishedTime: new Date(post.timestamp * 1000).toISOString(),
    },
    twitter: { card: 'summary', title, description },
    // Redacted tombstones have no content worth indexing.
    robots: isTombstone(requestedPost) ? { index: false } : undefined,
  };
}

export default async function ThreadPage({ params }: Params) {
  const { dir, cid } = await params;
  const { targetReplyCid, thread } = await resolveThread(decodeURIComponent(dir), decodeURIComponent(cid));
  const { post, replies } = thread;

  return (
    <article>
      <ReplyTarget cid={targetReplyCid} />
      <div className="results-head">
        <Link href={boardPath(post.community_address)} className="chip">
          /{segmentForAddress(post.community_address)}/
        </Link>{' '}
        {post.archived ? (
          <span className="flag flag-archived" title="No longer live upstream — preserved by this archive">
            Archived
          </span>
        ) : null}
      </div>

      <div className="card thread-op">
        <h1>{threadTitle(post)}</h1>
        <div className="meta">
          <span>{post.author_name ?? 'anon'}</span>
          <span>·</span>
          <time dateTime={new Date(post.timestamp * 1000).toISOString()}>{timeAgo(post.timestamp)}</time>
        </div>
        {post.link ? (
          <p className="meta">
            <a className="chip" href={post.link} target="_blank" rel="noopener noreferrer nofollow">
              {post.link}
            </a>
          </p>
        ) : null}
        {isTombstone(post) ? <Tombstone comment={post} /> : post.content ? <Prose text={post.content} /> : null}
      </div>

      <h2 className="section-title">
        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
      </h2>
      {replies.map((r) => (
        <div
          className={`reply${r.cid === targetReplyCid ? ' reply-target' : ''}${isTombstone(r) ? ' reply-tombstone' : ''}`}
          key={r.cid}
          id={replyAnchor(r.cid)}
        >
          <div className="meta">
            <span>{r.author_name ?? 'anon'}</span>
            <span>·</span>
            <time dateTime={new Date(r.timestamp * 1000).toISOString()}>{timeAgo(r.timestamp)}</time>
            <span>·</span>
            <Link className="permalink" href={threadPath(r)} title={r.cid}>
              No.{r.cid.slice(-8)}
            </Link>
          </div>
          {isTombstone(r) ? <Tombstone comment={r} /> : <Prose text={r.content ?? ''} />}
        </div>
      ))}
    </article>
  );
}
