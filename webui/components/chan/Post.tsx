import Link from 'next/link';
import type { ReactNode } from 'react';
import { Tombstone } from '@/components/Tombstone';
import { UpstreamPostLink } from '@/components/Upstream';
import { boardPath, replyAnchor, segmentForAddress, threadPath } from '@/lib/directories';
import { timeAgo } from '@/lib/format';
import {
  authorLabel,
  formatPostDate,
  isoDate,
  mediaFileName,
  mediaLabel,
  thumbnailSize,
  userIdColors,
  type PostView,
} from '@/lib/post';
import type { ThreadLinks } from '@/lib/thread';
import archive from '@/styles/archive.module.css';
import styles from '@/styles/5chan/post.module.css';
import { Markdown, QuoteLink } from './Markdown';
import { PostMedia, type MediaVariant } from './PostMedia';

/**
 * 5chan's PostDesktop and PostMobile, as one server component. 5chan picks one
 * in JavaScript; here both are emitted and its own stylesheet shows one per
 * viewport (post-styles.module.css hides .postDesktop/.replyDesktop under
 * 640px and .postMobile/.replyMobile above it). Anchors (#p<cid>) live on the
 * desktop tree; the mobile copy carries data-anchor, which AnchorScroll
 * scrolls to when the desktop one is hidden.
 */

export type ThreadMode = 'board' | 'thread';

export interface ThreadProps {
  op: PostView;
  /** Replies to render: the board preview, or the whole thread. */
  replies: PostView[];
  links: ThreadLinks;
  mode: ThreadMode;
  /** Replies in the thread, and replies carrying a link, for the board summary line. */
  totalReplies: number;
  totalLinks: number;
  /** The reply a reply-permalink route points at. */
  targetCid?: string;
  /**
   * "Board: …" on each thread. Multiboard views name the code, as 5chan does
   * (`code`); a code shared by several boards names the board (`address`).
   */
  boardLabel?: BoardLabelKind;
  /** Rendered under the opening post (the thread page's provenance line). */
  opFooter?: ReactNode;
}

/** 5chan shows the first 1000 characters on a board page, 2000 in a thread. */
const BOARD_CONTENT_LIMIT = 1000;

export type BoardLabelKind = 'code' | 'address';

/** Where a "Board:" label points and what it says. */
function boardLabel(view: PostView, kind: BoardLabelKind) {
  const address = view.comment.community_address;
  return kind === 'address'
    ? { href: `/${encodeURIComponent(address)}`, text: address }
    : { href: boardPath(address), text: `/${segmentForAddress(address)}/` };
}

const BoardLabel = ({ view, kind }: { view: PostView; kind: BoardLabelKind }) => {
  const { href, text } = boardLabel(view, kind);
  return (
    <>
      Board: <Link href={href}>{text}</Link>{' '}
    </>
  );
};

function Name({ view }: { view: PostView }) {
  const name = authorLabel(view.comment);
  return (
    <>
      {/* Never truncated, unlike 5chan's: the structured data quotes this byline verbatim. */}
      <span className={styles.name}>{name} </span>
      {view.userId ? (
        <>
          (ID:{' '}
          <span className={styles.userAddress} style={userIdColors(view.userId)} title="Posts by this ID">
            {view.userId}
          </span>
          ){' '}
        </>
      ) : null}
    </>
  );
}

function PostDate({ view }: { view: PostView }) {
  return (
    <time dateTime={isoDate(view.comment.timestamp)} title={`${timeAgo(view.comment.timestamp)} (UTC)`}>
      {formatPostDate(view.comment.timestamp)}
    </time>
  );
}

/** "No." links to the post's own route, like 5chan's; the number is its board-wide sequence. */
function PostNumber({ view }: { view: PostView }) {
  const href = threadPath(view.comment);
  return (
    <span className={styles.postNumLink}>
      <Link href={href} title="Link to this post" data-permalink="">
        No.
      </Link>
      <Link href={href} className={styles.replyToPost} title="Link to this post">
        {view.number ?? view.comment.cid.slice(-8)}
      </Link>
    </span>
  );
}

function StateIcons({ view }: { view: PostView }) {
  const archived = !view.isReply && view.comment.archived === 1;
  return (
    <>
      {view.pinned ? (
        <span className={styles.stickyIconWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 16px pixel icon */}
          <img src="/assets/icons/sticky.gif" alt="Sticky" title="Sticky" width={16} height={16} />
        </span>
      ) : null}
      {view.locked ? (
        <span className={`${styles.closedIconWrapper} ${styles.addPaddingBeforeReply}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 16px pixel icon */}
          <img src="/assets/icons/closed.gif" alt="Closed" title="Closed" width={16} height={16} />
        </span>
      ) : null}
      {archived ? (
        <span className={`${styles.closedIconWrapper} ${view.locked || view.pinned ? styles.addPaddingInBetween : styles.addPaddingBeforeReply}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 16px pixel icon */}
          <img
            src="/assets/icons/archived.gif"
            alt="Archived"
            title="Archived — no longer live upstream, preserved by this archive"
            width={16}
            height={16}
          />
        </span>
      ) : null}
    </>
  );
}

function Backlinks({ view, links }: { view: PostView; links: ThreadLinks }) {
  return links.backlinks(view.comment.cid).map((reply) => (
    <a key={reply.comment.cid} className={styles.backlink} href={links.href(reply)}>
      {'>>'}
      {reply.number ?? reply.comment.cid.slice(-8)}
    </a>
  ));
}

function PostInfoDesktop({ view, links, mode, targetCid }: { view: PostView; links: ThreadLinks; mode: ThreadMode; targetCid?: string }) {
  const title = view.comment.title?.trim();
  return (
    <div className={styles.postInfo}>
      <span className={view.tombstone && view.isReply && !view.comment.mod_reason ? styles.postDesktopHidden : undefined}>
        {title && !view.tombstone ? <span className={styles.subject}>{title.length <= 75 ? title : `${title.slice(0, 75)}(...)`} </span> : null}
        <span className={styles.nameBlock}>
          <Name view={view} />
        </span>
        <span>
          <PostDate view={view} />{' '}
        </span>
        <span>
          <PostNumber view={view} />
          <StateIcons view={view} />
          {mode === 'board' && !view.isReply ? (
            <span className={styles.replyButton}>
              [<Link href={threadPath(view.comment)}>View Thread</Link>]
            </span>
          ) : null}
        </span>
        {view.comment.cid === targetCid ? (
          <>
            {' '}
            <UpstreamPostLink post={view.comment} />
          </>
        ) : null}
        <Backlinks view={view} links={links} />
      </span>
    </div>
  );
}

function PostInfoMobile({ view, label }: { view: PostView; label?: BoardLabelKind }) {
  const title = view.comment.title?.trim();
  return (
    <div className={styles.postInfo}>
      <span>
        <span className={styles.nameBlock}>
          <Name view={view} />
          <StateIcons view={view} />
          {title && !view.tombstone ? (
            <span className={styles.subjectWrapper}>
              <span className={styles.subject}>{title.length <= 30 ? title : `${title.slice(0, 30)}(...)`}</span>
            </span>
          ) : null}
        </span>
        <span className={styles.dateTimePostNum}>
          {label ? (
            <div className={styles.postNumLink}>
              <Link href={boardLabel(view, label).href}>Board: {boardLabel(view, label).text}</Link>
            </div>
          ) : null}
          <PostDate view={view} /> <PostNumber view={view} />
        </span>
      </span>
    </div>
  );
}

function Media({ view, variant, label }: { view: PostView; variant: MediaVariant; label?: BoardLabelKind }) {
  const info = view.media;
  if (!info) return null;
  const size = thumbnailSize(info, variant === 'op' ? 250 : 125);
  const details = mediaLabel(info);
  const isFile = info.type !== 'webpage';
  return (
    <PostMedia
      media={info}
      size={size}
      variant={variant}
      spoiler={view.spoiler}
      fileText={
        variant === 'mobile'
          ? undefined
          : {
              label: isFile ? 'File' : 'Link',
              name: mediaFileName(info),
              details,
              board: label ? <BoardLabel view={view} kind={label} /> : undefined,
            }
      }
      mobileInfo={variant === 'mobile' ? `${view.spoiler ? 'Spoiler - ' : ''}${details.split(',')[0]}` : undefined}
    />
  );
}

/** 5chan's CommentContent: prepended quotelinks, the text, its edit/moderation notes. */
function Message({ view, links, mode }: { view: PostView; links: ThreadLinks; mode: ThreadMode }) {
  const { comment } = view;
  const content = comment.content ?? '';
  const truncated = mode === 'board' && content.length > BOARD_CONTENT_LIMIT;
  const prepended = view.isReply && !view.tombstone ? links.prepended(view) : [];

  return (
    <blockquote className={styles.postMessage}>
      {prepended.map((target) =>
        target.number !== undefined ? (
          <span key={target.comment.cid}>
            <QuoteLink number={target.number} resolve={links.resolve} />
            <br />
          </span>
        ) : null,
      )}
      {view.tombstone ? (
        <Tombstone comment={comment} />
      ) : content ? (
        <Markdown content={truncated ? content.slice(0, BOARD_CONTENT_LIMIT) : content} resolve={links.resolve} />
      ) : null}
      {truncated ? (
        <span className={styles.abbr}>
          <br />
          <br />
          Comment too long. <Link href={threadPath(comment)}>Click here</Link> to view the full text.
        </span>
      ) : null}
    </blockquote>
  );
}

function ReplyDesktop({ view, links, targetCid }: { view: PostView; links: ThreadLinks; targetCid?: string }) {
  const highlighted = view.comment.cid === targetCid;
  return (
    <div className={styles.replyDesktop}>
      <div className={styles.sideArrows}>{'>>'}</div>
      <div className={`${styles.reply} highlightable${highlighted ? ` ${styles.highlight} reply-target` : ''}`}>
        <PostInfoDesktop view={view} links={links} mode="thread" targetCid={targetCid} />
        {view.media ? (
          <div>
            <Media view={view} variant="reply" />
          </div>
        ) : null}
        <Message view={view} links={links} mode="thread" />
      </div>
    </div>
  );
}

function ReplyMobile({ view, links, targetCid }: { view: PostView; links: ThreadLinks; targetCid?: string }) {
  const highlighted = view.comment.cid === targetCid;
  return (
    <div className={styles.replyMobile}>
      <div className={styles.reply}>
        <div className={`${styles.replyContainer} highlightable${highlighted ? ` ${styles.highlight}` : ''}`}>
          <PostInfoMobile view={view} />
          <Media view={view} variant="mobile" />
          <Message view={view} links={links} mode="thread" />
          <MobileBacklinks view={view} links={links} />
        </div>
      </div>
    </div>
  );
}

function MobileBacklinks({ view, links }: { view: PostView; links: ThreadLinks }) {
  const backlinks = links.backlinks(view.comment.cid);
  if (backlinks.length === 0) return null;
  return (
    <div className={styles.mobileReplyBacklinks}>
      {backlinks.map((reply) => (
        <span key={reply.comment.cid}>
          <a className={styles.backlink} href={links.href(reply)}>
            {'>>'}
            {reply.number ?? reply.comment.cid.slice(-8)}
          </a>
        </span>
      ))}
    </div>
  );
}

/** "N replies omitted. Click here to view." — 5chan's board summary line. */
function omittedSummary(omitted: number, links: number, href: string): ReactNode {
  const counts = links > 0 ? `${omitted} ${omitted === 1 ? 'reply' : 'replies'} and ${links} ${links === 1 ? 'link' : 'links'} omitted.` : `${omitted} ${omitted === 1 ? 'reply' : 'replies'} omitted.`;
  return (
    <>
      {counts} <Link href={href}>Click here</Link> to view.
    </>
  );
}

function ThreadDesktop({ op, replies, links, mode, totalReplies, totalLinks, targetCid, boardLabel: label, opFooter }: ThreadProps) {
  const { comment } = op;
  const omitted = mode === 'board' ? totalReplies - replies.length : 0;
  const omittedLinks = Math.max(0, totalLinks - replies.filter((r) => r.media).length);

  return (
    <div className={styles.postDesktop}>
      <div className={styles.hrWrapper}>
        <hr />
      </div>
      <div>
        <div className={`${styles.opContainer} ${archive.target}`} id={replyAnchor(comment.cid)}>
          {op.media ? (
            <div>
              <Media view={op} variant="op" label={label} />
            </div>
          ) : label ? (
            <div>
              <div className={styles.fileText}>
                <BoardLabel view={op} kind={label} />
              </div>
            </div>
          ) : null}
          <PostInfoDesktop view={op} links={links} mode={mode} targetCid={targetCid} />
          {!comment.content && !op.tombstone ? <div className={styles.spacer} /> : null}
          <Message view={op} links={links} mode={mode} />
          {opFooter}
        </div>
        {omitted > 0 ? <span className={styles.summary}>{omittedSummary(omitted, omittedLinks, threadPath(comment))}</span> : null}
        {replies.map((reply) => (
          <div key={reply.comment.cid} className={`${styles.replyContainer} ${archive.target}`} id={replyAnchor(reply.comment.cid)} data-reply={reply.comment.cid}>
            <ReplyDesktop view={reply} links={links} targetCid={targetCid} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** "12 Replies / 3 Links" — the bar under a mobile OP on a board page. */
const mobileCounts = (replies: number, links: number) =>
  [replies > 0 ? `${replies} ${replies === 1 ? 'Reply' : 'Replies'}` : null, links > 0 ? `${links} ${links === 1 ? 'Link' : 'Links'}` : null]
    .filter(Boolean)
    .join(' / ');

function ThreadMobile({ op, replies, links, mode, totalReplies, totalLinks, targetCid, boardLabel: label, opFooter }: ThreadProps) {
  return (
    <div className={styles.postMobile}>
      <div className={styles.hrWrapper}>
        <hr />
      </div>
      <div className={styles.thread}>
        <div className={styles.postContainer}>
          <div className={styles.postOp} data-anchor={replyAnchor(op.comment.cid)}>
            <PostInfoMobile view={op} label={label} />
            <Media view={op} variant="mobile" />
            <Message view={op} links={links} mode={mode} />
            <MobileBacklinks view={op} links={links} />
            {opFooter}
          </div>
          {mode === 'board' ? (
            <div className={styles.postLink}>
              <span className={styles.info}>{mobileCounts(totalReplies, totalLinks)}</span>
              <Link href={threadPath(op.comment)} className="button">
                View Thread
              </Link>
            </div>
          ) : null}
        </div>
        {replies.map((reply) => (
          <div key={reply.comment.cid} className={styles.replyContainer} data-anchor={replyAnchor(reply.comment.cid)}>
            <ReplyMobile view={reply} links={links} targetCid={targetCid} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Thread(props: ThreadProps) {
  return (
    <div className={styles.thread} data-thread={props.op.comment.cid}>
      <ThreadDesktop {...props} />
      <ThreadMobile {...props} />
    </div>
  );
}
