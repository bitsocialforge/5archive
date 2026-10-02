'use client';

import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { MediaInfo } from '@/lib/post';
import media from '@/styles/5chan/comment-media.module.css';
import post from '@/styles/5chan/post.module.css';

/**
 * 5chan's PostMedia + CommentMedia: a thumbnail that expands in place on click
 * and collapses back. Every thumbnail is also a plain link to the file, so
 * without JavaScript it simply opens the media, as 4chan's does.
 *
 * Media is embedded from wherever the post links it; the archive hosts none.
 */

export type MediaVariant = 'op' | 'reply' | 'mobile';

interface Props {
  media: MediaInfo;
  /** Thumbnail box size, already scaled for the variant. */
  size: { width: number; height: number };
  variant: MediaVariant;
  spoiler: boolean;
  /** Desktop only: the "File: name (type, WxH)" line above the thumbnail. */
  fileText?: { label: string; name: string; details: string; board?: ReactNode };
  /** Mobile only: the type under the thumbnail. */
  mobileInfo?: string;
}

const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** 5chan's MediaLoadFailure: archived links rot, and the archive hosts no copies. */
function MediaLoadFailure({ url, compact }: { url: string; compact: boolean }) {
  const host = hostOf(url);
  const status = host ? `External image from ${host} failed to load.` : 'External image failed to load.';
  return compact ? (
    // eslint-disable-next-line @next/next/no-img-element -- 5chan's pixel placeholder
    <img className={media.fileDeleted} src="/assets/filedeleted-res.gif" alt={status} title={status} />
  ) : (
    <output className={media.mediaLoadFailure} title={status}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 5chan's pixel placeholder */}
      <img className={media.fileDeleted} src="/assets/filedeleted-res.gif" alt="" aria-hidden="true" />
      <span className={media.mediaLoadFailureSource}>{status}</span>
      <a className={media.mediaLoadFailureLink} href={url} target="_blank" rel="noopener noreferrer nofollow">
        Open original file
      </a>
    </output>
  );
}

/** The media itself, once a thumbnail is clicked: 5chan's expanded image, video or embed. */
function ExpandedMedia({ info, variant, onCollapse }: { info: MediaInfo; variant: MediaVariant; onCollapse: (event: MouseEvent) => void }) {
  const mediaClass = variant === 'mobile' ? media.mediaMobile : variant === 'reply' ? media.mediaDesktopReply : media.mediaDesktopOp;
  let content: ReactNode;
  if (info.type === 'video') {
    // 5chan's default: expanded videos loop, start muted, and keep their controls.
    content = <video src={info.url} controls autoPlay loop muted playsInline />;
  } else if (info.type === 'youtube' && info.youtubeId) {
    content = (
      <iframe
        src={youtubeEmbed(info.youtubeId)}
        width={variant === 'op' ? 640 : 480}
        height={variant === 'op' ? 360 : 270}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="YouTube video"
      />
    );
  } else {
    content = (
      <a href={info.url} target="_blank" rel="noopener noreferrer nofollow" onClick={onCollapse} aria-label="Collapse image">
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party media */}
        <img src={info.url} alt="" referrerPolicy="no-referrer" />
      </a>
    );
  }
  return <span className={`${mediaClass} ${media.removeFloat}`}>{content}</span>;
}

/** What the thumbnail link shows: the spoiler card, a video's first frame, or the image. */
function ThumbnailContent({ info, spoiler, onFail }: { info: MediaInfo; spoiler: boolean; onFail: () => void }) {
  // A server-rendered image can fail before hydration attaches onError.
  const watchImage = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0) onFail();
    },
    [onFail],
  );

  if (spoiler) {
    // eslint-disable-next-line @next/next/no-img-element -- static spoiler card
    return <img className={media.spoiler} src="/assets/spoiler.png" alt="Spoiler" />;
  }
  if (info.type === 'video' && !info.thumbnail) return <video src={info.url} preload="metadata" muted playsInline />;
  // eslint-disable-next-line @next/next/no-img-element -- third-party media, sized by CSS
  return <img ref={watchImage} src={info.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onFail} />;
}

function FileText({ info, fileText, spoiler, onClose }: { info: MediaInfo; fileText: NonNullable<Props['fileText']>; spoiler: boolean; onClose?: () => void }) {
  return (
    <div className={post.fileText}>
      {fileText.board}
      {fileText.label}:{' '}
      <a href={info.url} target="_blank" rel="noopener noreferrer nofollow">
        {spoiler ? 'Spoiler' : fileText.name}
      </a>{' '}
      ({fileText.details})
      {onClose ? (
        <span>
          -[
          <button type="button" className={post.closeMedia} onClick={onClose}>
            close
          </button>
          ]
        </span>
      ) : null}
    </div>
  );
}

/** 5chan's thumbnail box; on mobile it floats together with its type label underneath. */
function ThumbnailBox({
  info,
  size,
  variant,
  spoiler,
  label,
  onClick,
  mobileInfo,
}: Pick<Props, 'size' | 'variant' | 'spoiler' | 'mobileInfo'> & { info: MediaInfo; label: string; onClick: (event: MouseEvent) => void }) {
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const dimensions = { '--width': `${spoiler ? 150 : size.width}px`, '--height': `${spoiler ? 150 : size.height}px` } as CSSProperties;
  const mobile = variant === 'mobile';
  const box = (
    <span className={mobile ? `${media.thumbnailSmall} ${media.thumbnailMobile}` : `${media.thumbnailBig} ${media.thumbnail}`} style={dimensions}>
      {failed ? (
        // Not inside the link: the card carries its own "Open original file" link.
        <MediaLoadFailure url={info.url} compact={mobile} />
      ) : (
        <a href={info.url} target="_blank" rel="noopener noreferrer nofollow" className={media.mediaToggleButton} aria-label={label} onClick={onClick}>
          <ThumbnailContent info={info} spoiler={spoiler} onFail={onFail} />
        </a>
      )}
    </span>
  );
  if (!mobile) return box;
  return (
    <span className={media.thumbnail}>
      {box}
      {mobileInfo ? <div className={media.fileInfo}>{mobileInfo}</div> : null}
    </span>
  );
}

export function PostMedia({ media: info, size, variant, spoiler, fileText, mobileInfo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const expandable = info.type !== 'webpage' && info.type !== 'audio';
  const hasThumbnail = spoiler || Boolean(info.thumbnail) || info.type === 'video';
  const toggle = (event: MouseEvent) => {
    if (!expandable || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setExpanded((value) => !value);
  };

  let body: ReactNode = null;
  if (info.type === 'audio') {
    body = <audio src={info.url} controls preload="none" />;
  } else if (expanded) {
    body = <ExpandedMedia info={info} variant={variant} onCollapse={toggle} />;
  } else if (hasThumbnail) {
    body = <ThumbnailBox info={info} size={size} variant={variant} spoiler={spoiler} label={expandable ? 'Expand media' : 'Open link'} onClick={toggle} mobileInfo={mobileInfo} />;
  }

  const canCollapse = expanded && (info.type === 'video' || info.type === 'youtube');
  return (
    <>
      {fileText ? <FileText info={info} fileText={fileText} spoiler={spoiler} onClose={canCollapse ? () => setExpanded(false) : undefined} /> : null}
      {body ? (
        <div>
          <span className={media.content}>{body}</span>
        </div>
      ) : null}
    </>
  );
}
