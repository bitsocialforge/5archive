import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { BoardHeader } from '@/components/chan/BoardHeader';
import { BoardsBar } from '@/components/chan/BoardsBar';
import { BoardButtons, Bracket, PageFooter } from '@/components/chan/Chrome';
import footerStyles from '@/styles/5chan/footer.module.css';
import { Thread } from '@/components/chan/Post';
import { QuotePreviews } from '@/components/chan/QuotePreviews';
import { ThemeRoot } from '@/components/chan/ThemeRoot';
import { JsonLd } from '@/components/JsonLd';
import { AnchorScroll, ReplyTarget } from '@/components/ReplyTarget';
import { isTombstone } from '@/components/Tombstone';
import { UpstreamProvenance, UpstreamThreadEnd, UpstreamThreadForm } from '@/components/Upstream';
import { getCommunity, getThread } from '@/lib/api';
import { archivedBoards, boardPath, directoryForAddress, segmentForAddress, threadPath } from '@/lib/directories';
import { excerpt } from '@/lib/format';
import { threadGraph } from '@/lib/jsonld';
import { embeddedNumbers, postView } from '@/lib/post';
import { boardTheme } from '@/lib/theme';
import { threadLinks } from '@/lib/thread';
import type { Comment, Thread as ThreadData } from '@/lib/types';

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
async function loadThread(cid: string): Promise<{ requestedPost: Comment; targetReplyCid?: string; thread: ThreadData } | null> {
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
const isIndexable = (thread: ThreadData) => !isTombstone(thread.post);

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

/** 5chan's PostPageStats: "Archived / 12 / 3" — replies, then replies with links. */
function Stats({ archived, replies, links }: { archived: boolean; replies: number; links: number }) {
  return (
    <span>
      {archived ? 'Archived / ' : null}
      <span title="Replies">{replies}</span> / <span title="Links">{links}</span>
    </span>
  );
}

export default async function ThreadPage({ params }: Params) {
  const { dir, cid } = await params;
  const { targetReplyCid, thread } = await resolveThread(decodeURIComponent(dir), decodeURIComponent(cid));
  const { post, replies } = thread;
  const code = segmentForAddress(post.community_address);
  const directory = directoryForAddress(post.community_address);
  const headline = threadTitle(post);
  // No markup on a noindexed page: it can't produce a rich result and only
  // shows up in Search Console as invalid items.
  const graph = isIndexable(thread) ? threadGraph(thread, headline, code) : null;

  const community = await getCommunity(post.community_address);
  const op = postView(post);
  const numbers = embeddedNumbers(post);
  const views = replies.map((reply) => postView(reply, numbers));
  const links = threadLinks(op, views, new Set([post.cid, ...replies.map((r) => r.cid)]));
  const linkCount = views.filter((v) => v.media).length;
  const board = boardPath(post.community_address);
  const archived = post.archived === 1;

  const navLeft = (
    <>
      <Bracket href={board}>Return</Bracket> <Bracket href={`${board}/catalog`}>Catalog</Bracket>{' '}
    </>
  );

  return (
    <ThemeRoot theme={boardTheme([community])}>
      {graph ? <JsonLd graph={graph} /> : null}
      <ReplyTarget cid={targetReplyCid} />
      <AnchorScroll />
      <QuotePreviews />
      <span id="top" />
      <BoardsBar current={code} />
      <BoardHeader
        title={headline}
        subtitle={
          <>
            <Link href={board}>{directory?.title ?? `/${code}/`}</Link> ·{' '}
            {/* In a code shared by several boards, the address opens that board's own page. */}
            {directory && archivedBoards(directory).length > 1 ? (
              <Link href={`/${encodeURIComponent(post.community_address)}`}>{post.community_address}</Link>
            ) : (
              post.community_address
            )}
          </>
        }
      />
      <UpstreamThreadForm post={post} code={code} />
      <BoardButtons
        left={
          <>
            {navLeft}
            <Bracket href="#bottom">Bottom</Bracket>
          </>
        }
        right={<Stats archived={archived} replies={replies.length} links={linkCount} />}
        mobile={
          <>
            <Link className="button" href={board}>
              Return
            </Link>{' '}
            <Link className="button" href={`${board}/catalog`}>
              Catalog
            </Link>{' '}
            <Link className="button" href="#bottom">
              Bottom
            </Link>
          </>
        }
      />
      <Thread
        op={op}
        replies={views}
        links={links}
        mode="thread"
        totalReplies={replies.length}
        totalLinks={linkCount}
        targetCid={targetReplyCid}
        opFooter={<UpstreamProvenance post={post} />}
      />
      <span id="bottom" />
      <PageFooter
        firstRow={
          <div className={footerStyles.threadRow}>
            <div className={footerStyles.threadLeft}>
              {navLeft}
              <Bracket href="#top">Top</Bracket>
            </div>
            <div className={footerStyles.threadCenter}>
              <UpstreamThreadEnd post={post} code={code} />
            </div>
            <div className={footerStyles.threadRight}>
              <Stats archived={archived} replies={replies.length} links={linkCount} />
            </div>
          </div>
        }
        mobile={
          <div className={footerStyles.threadMobileFooterContent}>
            <div className={footerStyles.mobileFooterButtons}>
              <UpstreamThreadEnd post={post} code={code} mobile />
            </div>
            <div className={footerStyles.mobileFooterButtons}>
              <Link className="button" href={board}>
                Return
              </Link>{' '}
              <Link className="button" href={`${board}/catalog`}>
                Catalog
              </Link>{' '}
              <Link className="button" href="#top">
                Top
              </Link>
            </div>
            <div className={footerStyles.mobileFooterStats}>
              Replies: {replies.length} / Links: {linkCount}
            </div>
          </div>
        }
      />
    </ThemeRoot>
  );
}
