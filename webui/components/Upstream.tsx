import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { siteName, upstreamName, upstreamUrl } from '@/lib/site';
import {
  hasUpstream,
  isLiveUpstream,
  upstreamBoardUrl,
  upstreamDirectoryUrl,
  upstreamThreadUrl,
} from '@/lib/upstream';
import type { Comment } from '@/lib/types';
import archive from '@/styles/archive.module.css';

/**
 * The way out of the archive and into the live network.
 *
 * Search traffic lands here, on a read-only copy, and the job of these links is
 * to move that reader to 5chan without the page having to stop being a real
 * page (see lib/upstream.ts for why redirecting is off the table). They are
 * plain follow links to a sibling site — never nofollow — and deliberately keep
 * their referrer, so upstream can see the archive is what sent the reader.
 *
 * They sit where 5chan puts the same actions — the post form toggle, the
 * blotter, the board bar — and say where they go. None of them is dressed up
 * as a form: a control that looks like it accepts a post and doesn't is a lie
 * told to the most engaged reader on the page.
 *
 * Nothing here renders unless the instance is configured with an upstream.
 */

/** Bare `↗` reads as noise when spoken. */
const Out = () => (
  <span aria-hidden className="out">
    {' '}↗
  </span>
);

/**
 * The board page's post form slot: "[Start a New Thread on 5chan]". A code's
 * page links the code rather than a board address: it aggregates every board
 * holding the code, so it maps to whichever board 5chan currently resolves.
 */
export function UpstreamBoardForm({ code, board }: { code: string; board?: string }) {
  if (!hasUpstream) return null;
  // A single board's page links that board instead.
  return <PostFormLink href={board ? upstreamBoardUrl(board) : upstreamDirectoryUrl(code)} label={`Start a New Thread on ${upstreamName}`} />;
}

/** 5chan's post form toggle — bracketed text on desktop, a button on mobile — as a link out. */
function PostFormLink({ href, label }: { href: string; label: string }) {
  return (
    <>
      <div className={archive.postFormDesktop}>
        [<a className="button" href={href}>{label}</a>]
      </div>
      <div className={archive.postFormMobile}>
        <a className="button" href={href}>
          {label}
          <Out />
        </a>
      </div>
    </>
  );
}

/**
 * The thread page's post form slot. A live thread offers 5chan's own action,
 * one hop away; a thread 5chan has already purged says so the way 5chan says it
 * about archived threads, and points at its board instead — a purged thread is
 * worse than a 404 on a p2p network, the app would sit on a fetch that never
 * resolves.
 */
export function UpstreamThreadForm({ post, code }: { post: Comment; code: string }) {
  if (!hasUpstream) {
    return isLiveUpstream(post) ? null : (
      <div className={archive.closed}>
        Thread archived.
        <br />
        You may not reply anymore.
      </div>
    );
  }

  if (isLiveUpstream(post)) {
    return <PostFormLink href={upstreamThreadUrl(post)} label={`Post a Reply on ${upstreamName}`} />;
  }

  return (
    <div className={archive.closed}>
      Thread archived.
      <br />
      You may not reply anymore.
      <br />
      {/* Same tab: the point is to leave. */}
      [<a href={upstreamBoardUrl(post.community_address)}>Go to /{code}/ on {upstreamName}<Out /></a>]
    </div>
  );
}

/**
 * Says where a thread came from and when it was taken, under its opening post.
 *
 * This is a citation before it is a funnel: republishing another site's content
 * without crediting the source is Google's own description of scraping, and an
 * archive's defence is that it names what it preserves. The date is the
 * indexer's first sighting, which never moves once written.
 */
export function UpstreamProvenance({ post }: { post: Comment }) {
  if (!hasUpstream) return null;

  return (
    <div className={archive.provenance}>
      Archived from <a href={upstreamBoardUrl(post.community_address)}>{upstreamName}</a> on {formatDate(post.indexed_at)}. This copy is read-only.
    </div>
  );
}

/**
 * Link to one reply upstream, in its info line. Reserved for the reply the URL
 * actually targets: 5chan resolves any reply cid to its root thread, so a link
 * per reply would land every reader in the same place. Opens in a new tab; the
 * reader is mid-thread and shouldn't lose their place.
 */
export function UpstreamPostLink({ post }: { post: Comment }) {
  if (!hasUpstream || !isLiveUpstream(post)) return null;

  return (
    <span className="upstream">
      [
      <a href={upstreamThreadUrl(post)} target="_blank" rel="noopener" title={`Open this post on ${upstreamName}`}>
        {upstreamName}
        <Out />
      </a>
      ]
    </span>
  );
}

/**
 * The end of a thread: the reader has just finished every reply, which is the
 * one moment they might want to say something — and the one thing this site
 * can never let them do. 5chan's thread footer carries the same action.
 */
export function UpstreamThreadEnd({ post, code, mobile = false }: { post: Comment; code: string; mobile?: boolean }) {
  if (!hasUpstream) return null;

  const live = isLiveUpstream(post);
  const link = (
    <a className="button" href={live ? upstreamThreadUrl(post) : upstreamBoardUrl(post.community_address)}>
      {live ? `Post a Reply on ${upstreamName}` : `Go to /${code}/ on ${upstreamName}`}
    </a>
  );
  // Desktop text buttons wear brackets; mobile ones are drawn as buttons.
  return mobile ? link : <span>[{link}]</span>;
}

/** The home page's "What is 5archive?" box: what the site is, and where the live network is. */
export function UpstreamIntro() {
  return (
    <>
      {siteName} is the permanent public archive{hasUpstream ? <> of <a href={upstreamUrl}>{upstreamName}</a></> : null}.{' '}
      {hasUpstream ? `${upstreamName} purges threads 48 hours after archiving them; ${siteName}` : siteName} keeps every board readable and
      searchable, permanently. Every thread is kept as it was crawled, read-only; moderator removals and author deletions stay redacted.
      {hasUpstream ? (
        <>
          <br />
          <br />
          To post, reply or start a board, go to <a href={upstreamUrl}>{upstreamName}</a> — this site only keeps the record. See{' '}
          <Link href="/legal">Legal</Link> for the archive policy and takedown requests.
        </>
      ) : null}
    </>
  );
}
