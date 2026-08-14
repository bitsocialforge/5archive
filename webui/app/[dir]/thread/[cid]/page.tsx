import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Prose } from '@/components/Prose';
import { isTombstone, Tombstone } from '@/components/Tombstone';
import { getThread } from '@/lib/api';
import { boardPath, replyAnchor, segmentForAddress, threadPath } from '@/lib/directories';
import { excerpt, timeAgo } from '@/lib/format';
import type { Comment, Thread } from '@/lib/types';

// Threads are archived content: cache the page, revalidate for late replies.
export const revalidate = 300;

type Params = { params: Promise<{ dir: string; cid: string }> };

function score(c: Comment) {
  return c.upvote_count - c.downvote_count;
}

function threadTitle(post: Comment): string {
  if (post.takedown || post.removed) return '[removed]';
  if (post.deleted) return '[deleted]';
  return post.title || excerpt(post.content, 70) || 'untitled';
}

/**
 * Resolve `/<dir>/thread/<cid>`. Like 5chan, the cid may be a reply — the API
 * returns it as its own comment, so send those to the thread they belong to,
 * anchored at the reply. A cid reached under the wrong directory segment
 * redirects to its own, keeping one canonical URL per thread.
 */
async function resolveThread(segment: string, cid: string): Promise<Thread> {
  const thread = await getThread(cid);
  if (!thread) notFound();

  const { post } = thread;
  if (post.cid !== post.post_cid) permanentRedirect(threadPath(post));
  if (segment !== segmentForAddress(post.community_address)) permanentRedirect(threadPath(post));
  return thread;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { cid } = await params;
  const thread = await getThread(decodeURIComponent(cid));
  if (!thread) return { title: 'Thread not found', robots: { index: false } };

  const { post } = thread;
  const title = threadTitle(post);
  const description =
    excerpt(post.content) || `A thread from ${post.community_address} with ${post.reply_count} replies.`;
  const canonical = threadPath(post);

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
    robots: isTombstone(post) ? { index: false } : undefined,
  };
}

export default async function ThreadPage({ params }: Params) {
  const { dir, cid } = await params;
  const { post, replies } = await resolveThread(decodeURIComponent(dir), decodeURIComponent(cid));

  return (
    <article>
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
          <span>▲ {score(post)}</span>
          <span>·</span>
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
        <div className={`reply${isTombstone(r) ? ' reply-tombstone' : ''}`} key={r.cid} id={replyAnchor(r.cid)}>
          <div className="meta">
            <span>{r.author_name ?? 'anon'}</span>
            <span>·</span>
            <time dateTime={new Date(r.timestamp * 1000).toISOString()}>{timeAgo(r.timestamp)}</time>
            <span>·</span>
            <span>▲ {score(r)}</span>
            <span>·</span>
            <a className="permalink" href={`#${replyAnchor(r.cid)}`} title={r.cid}>
              No.{r.cid.slice(-8)}
            </a>
          </div>
          {isTombstone(r) ? <Tombstone comment={r} /> : <Prose text={r.content ?? ''} />}
        </div>
      ))}
    </article>
  );
}
