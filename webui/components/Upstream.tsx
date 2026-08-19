import { siteName, upstreamName, upstreamUrl } from '@/lib/site';
import { formatDate } from '@/lib/format';
import {
  hasUpstream,
  isLiveUpstream,
  upstreamBoardUrl,
  upstreamDirectoryUrl,
  upstreamThreadUrl,
} from '@/lib/upstream';
import type { Comment } from '@/lib/types';

/**
 * The way out of the archive and into the live network.
 *
 * Search traffic lands here, on a read-only copy, and the job of these links is
 * to move that reader to 5chan without the page having to stop being a real
 * page (see lib/upstream.ts for why redirecting is off the table). They are
 * plain follow links to a sibling site — never nofollow — and deliberately keep
 * their referrer, so upstream can see the archive is what sent the reader.
 *
 * Nothing here renders unless the instance is configured with an upstream.
 */

/** Bare `↗` reads as noise when spoken. */
const Out = () => (
  <span aria-hidden className="out">
    ↗
  </span>
);

/**
 * The one link that survives a three-hundred-reply thread. Readers spend most
 * of their time on the first screen and a shrinking fraction of it after the
 * second, so an end-of-thread call to action alone reaches almost nobody on a
 * long page; the header is already sticky, which makes it the cheapest place to
 * put a permanent way out — no new fixed overlay, nothing covering the content.
 *
 * It points at the app's front door, never a thread. A link baked into the
 * layout outlives every thread it could name.
 */
export function UpstreamHeaderLink() {
  if (!hasUpstream) return null;

  return (
    <a
      className="header-upstream"
      href={upstreamUrl}
      title={`${upstreamName} — the live network this archive mirrors`}
    >
      {upstreamName} <Out />
    </a>
  );
}

/**
 * Line beside the thread heading. Deliberately quiet: the reader came to read,
 * and anything that covers the content on arrival is an intrusive interstitial.
 * It always offers a destination rather than restating status — the Archived
 * flag beside it already says what happened; this says where to go instead.
 */
export function UpstreamThreadNote({ post, code }: { post: Comment; code: string }) {
  if (!hasUpstream) return null;

  return isLiveUpstream(post) ? (
    <a className="upstream-note" href={upstreamThreadUrl(post)}>
      Live on {upstreamName} — open the thread <Out />
    </a>
  ) : (
    <a className="upstream-note" href={upstreamBoardUrl(post.community_address)}>
      /{code}/ is live on {upstreamName} <Out />
    </a>
  );
}

/**
 * Says where this thread came from and when it was taken, at the foot of the
 * opening post.
 *
 * This is a citation before it is a funnel: republishing another site's content
 * without crediting the source is Google's own description of scraping, and an
 * archive's defence is that it names what it preserves. The date is the
 * indexer's first sighting, which never moves once written — a re-crawl updates
 * other columns, not this one.
 */
export function UpstreamProvenance({ post }: { post: Comment }) {
  if (!hasUpstream) return null;

  return (
    <p className="upstream-provenance">
      Archived from <a href={upstreamBoardUrl(post.community_address)}>{upstreamName}</a> on{' '}
      {formatDate(post.indexed_at)}. This copy is read-only.
    </p>
  );
}

/**
 * End-of-thread call to action: the reader has just finished every reply, which
 * is the one moment they might want to say something — and the one thing this
 * site can never let them do.
 *
 * Not dressed up as a reply box, tempting as that is in the slot where an
 * imageboard puts one: a control that looks like it accepts a post and doesn't
 * is a lie told to the most engaged reader on the page.
 */
export function UpstreamThreadCta({ post, code }: { post: Comment; code: string }) {
  if (!hasUpstream) return null;

  const live = isLiveUpstream(post);
  const boardUrl = upstreamBoardUrl(post.community_address);

  return (
    <aside className="upstream-cta">
      <p className="upstream-cta-title">
        {live ? `Reply on ${upstreamName}` : `This thread is gone from ${upstreamName}`}
      </p>
      <p className="upstream-cta-body">
        {live
          ? `${siteName} is a read-only copy. The thread is still live upstream — that's where you can post.`
          : `${upstreamName} purges threads 48 hours after archiving them, so this copy is all that's left. /${code}/ is still active.`}
      </p>
      {/* Terminal action: same tab, because the point is to leave. */}
      <a className="btn upstream-cta-btn" href={live ? upstreamThreadUrl(post) : boardUrl}>
        {live ? `Open this thread on ${upstreamName}` : `Go to /${code}/ on ${upstreamName}`} <Out />
      </a>
      {/* A thread can be purged between the last crawl and this click, and on a
          p2p network that hangs instead of 404ing. Hand over the escape route
          before they leave — afterwards there's nothing to click. */}
      {live ? (
        <a className="upstream-cta-alt" href={boardUrl}>
          Not loading? Go to /{code}/ <Out />
        </a>
      ) : null}
    </aside>
  );
}

/**
 * Link to one reply upstream, beside its archive permalink. Reserved for the
 * reply the URL actually targets: 5chan resolves any reply cid to its root
 * thread, so a link per reply would land every reader in the same place — and
 * because the route lives in the fragment, search engines would collapse all of
 * them into a single repeated outbound URL. Opens in a new tab; the reader is
 * mid-thread and shouldn't lose their place.
 */
export function UpstreamPostLink({ post }: { post: Comment }) {
  if (!hasUpstream || !isLiveUpstream(post)) return null;

  return (
    <a
      className="upstream-inline"
      href={upstreamThreadUrl(post)}
      target="_blank"
      rel="noopener"
      title={`Open this post on ${upstreamName}`}
    >
      {upstreamName} <Out />
    </a>
  );
}

/**
 * Home-page masthead. Doubles as the site's only h1: without it the home page
 * leads with two h2s and never states, in indexable text, what it is or what it
 * archives — the two things both a search engine and a first-time visitor are
 * trying to work out.
 */
export function UpstreamHomeIntro() {
  if (!hasUpstream) return null;

  return (
    <div className="upstream-intro">
      <h1>The {upstreamName} archive</h1>
      <p>
        {upstreamName} purges threads 48 hours after archiving them. {siteName} keeps every board
        readable and searchable, permanently.
      </p>
      <a className="upstream-intro-go" href={upstreamUrl}>
        Go to {upstreamName} <Out />
      </a>
    </div>
  );
}

/**
 * Board-page call to action. Keyed to the directory code rather than a board
 * address: this page's subject is the code, and it aggregates every board
 * holding it, so it maps to whichever board upstream currently resolves.
 *
 * The live count is the honest version of "come and join in" — it's checkable
 * against the page itself, since those are the threads with no Archived flag.
 */
export function UpstreamBoardCta({
  code,
  title,
  liveThreads,
}: {
  code: string;
  title: string;
  liveThreads: number;
}) {
  if (!hasUpstream) return null;

  return (
    <a className="upstream-board" href={upstreamDirectoryUrl(code)}>
      <span>
        <strong>/{code}/</strong> is live on {upstreamName} — browse and post there
        {liveThreads > 0 ? (
          <span className="upstream-board-live">
            {liveThreads} of the threads below {liveThreads === 1 ? 'is' : 'are'} still open upstream.
          </span>
        ) : null}
      </span>
      <span className="upstream-board-go" aria-label={`Open ${title} on ${upstreamName}`}>
        Open <Out />
      </span>
    </a>
  );
}
