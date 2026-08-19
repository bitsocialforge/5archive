import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { Prose } from '@/components/Prose';
import { ReplyTarget } from '@/components/ReplyTarget';
import { isTombstone, Tombstone } from '@/components/Tombstone';
import {
  UpstreamPostLink,
  UpstreamProvenance,
  UpstreamThreadCta,
  UpstreamThreadNote,
} from '@/components/Upstream';
import { getThread } from '@/lib/api';
import { boardPath, replyAnchor, segmentForAddress, threadPath } from '@/lib/directories';
import { threadGraph } from '@/lib/jsonld';
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

/**
 * Worth indexing unless the opening post itself is redacted: with the OP gone
 * there is no title and no body left, and a result reading "[removed]" helps
 * nobody. Keyed to the root post, never the requested one — a permalink to a
 * single removed reply otherwise hides the entire intact thread.
 */
const isIndexable = (thread: Thread) => !isTombstone(thread.post);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { cid } = await params;
  const resolved = await loadThread(decodeURIComponent(cid));
  if (!resolved) return { title: 'Thread not found', robots: { index: false } };

  const { thread } = resolved;
  const { post } = thread;
  const title = threadTitle(post);
  const description =
    excerpt(post.content) || `A thread from ${post.community_address} with ${post.reply_count} replies.`;
  // Every reply cid renders this same thread, so they all canonicalise to the
  // root. Left self-referential, a 200-reply thread would offer search engines
  // 201 near-identical URLs to sort out.
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
    robots: isIndexable(thread) ? undefined : { index: false },
  };
}

export default async function ThreadPage({ params }: Params) {
  const { dir, cid } = await params;
  const { targetReplyCid, thread } = await resolveThread(decodeURIComponent(dir), decodeURIComponent(cid));
  const { post, replies } = thread;
  const code = segmentForAddress(post.community_address);
  const headline = threadTitle(post);
  // No markup on a noindexed page: it can't produce a rich result and only
  // shows up in Search Console as invalid items.
  const graph = isIndexable(thread) ? threadGraph(thread, headline, code) : null;

  return (
    <article>
      {graph ? <JsonLd graph={graph} /> : null}
      <ReplyTarget cid={targetReplyCid} />
      <div className="results-head thread-head">
        <Link href={boardPath(post.community_address)} className="chip">
          /{code}/
        </Link>{' '}
        {post.archived ? (
          <span className="flag flag-archived" title="No longer live upstream — preserved by this archive">
            Archived
          </span>
        ) : null}
        <UpstreamThreadNote post={post} code={code} />
      </div>

      <div className="card thread-op">
        <h1>{headline}</h1>
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
        <UpstreamProvenance post={post} />
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
            {r.cid === targetReplyCid ? <UpstreamPostLink post={r} /> : null}
          </div>
          {isTombstone(r) ? <Tombstone comment={r} /> : <Prose text={r.content ?? ''} />}
        </div>
      ))}

      <UpstreamThreadCta post={post} code={code} />
    </article>
  );
}
