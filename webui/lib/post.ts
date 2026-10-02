import { isTombstone } from '@/components/Tombstone';
import type { Comment } from './types';

/**
 * Display data for one post, derived from its API row and the safe parts of its
 * signed record. Ports the bits of 5chan's post components the archive needs
 * (post number, media info, per-post IDs) without its hooks.
 *
 * `raw` is read for this comment's own `comment` and `commentUpdate` fields
 * only. An OP's commentUpdate also embeds its preloaded reply pages, verbatim
 * and unredacted: a reply that was later removed, deleted or taken down would
 * still be in there. Content always comes from the API's flattened rows, which
 * the indexer redacts.
 */
export interface PostView {
  comment: Comment;
  /** Board-scoped sequence number from the CommentUpdate ("No.387"). */
  number?: number;
  isReply: boolean;
  tombstone: boolean;
  spoiler: boolean;
  pinned: boolean;
  locked: boolean;
  /** Set only on boards in per-post pseudonymity mode, where 5chan shows "(ID: …)". */
  userId?: string;
  quotedCids: string[];
  media?: MediaInfo;
}

export type MediaType = 'image' | 'gif' | 'video' | 'audio' | 'youtube' | 'webpage';

export interface MediaInfo {
  url: string;
  type: MediaType;
  /** Image shown in the thumbnail box; absent for media the box renders itself (video). */
  thumbnail?: string;
  width?: number;
  height?: number;
  youtubeId?: string;
}

type Json = Record<string, unknown>;

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const parseRaw = (raw: string | null | undefined): { comment: Json; update: Json } => {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { comment?: Json; commentUpdate?: Json };
      return { comment: parsed.comment ?? {}, update: parsed.commentUpdate ?? {} };
    } catch {
      // Unparseable bookkeeping is not worth failing a page over.
    }
  }
  return { comment: {}, update: {} };
};

/**
 * The name block 5chan prints: the author's display name, "Anonymous", or the
 * moderation state for a redacted post. Structured data quotes this verbatim.
 */
export function authorLabel(c: Comment): string {
  if (c.takedown || c.removed) return 'Removed';
  if (c.deleted) return 'Deleted';
  return c.author_name?.trim() || 'Anonymous';
}

/**
 * cid → post number for the replies preloaded in an OP's CommentUpdate. Only
 * those two fields are read: the pages are not redacted, so nothing else in
 * them may reach a page. A redacted reply's own raw is null, so this is where
 * its number survives.
 */
export function embeddedNumbers(op: Comment): Map<string, number> {
  const numbers = new Map<string, number>();
  const walk = (update: Json | undefined, depth: number) => {
    const pages = (update?.replies as { pages?: Record<string, { comments?: { commentUpdate?: Json }[] }> } | undefined)?.pages;
    if (!pages || depth > 50) return;
    for (const page of Object.values(pages)) {
      for (const reply of page?.comments ?? []) {
        const cid = reply?.commentUpdate?.cid;
        const number = positive(reply?.commentUpdate?.number);
        if (typeof cid === 'string' && number !== undefined) numbers.set(cid, number);
        walk(reply?.commentUpdate, depth + 1);
      }
    }
  };
  walk(parseRaw(op.raw).update, 0);
  return numbers;
}

/** `numbers` fills in post numbers a comment's own record lacks (see embeddedNumbers). */
export function postView(comment: Comment, numbers?: Map<string, number>): PostView {
  const { comment: signed, update } = parseRaw(comment.raw);
  const tombstone = isTombstone(comment);
  const perPost = signed.pseudonymityMode === 'per-post';
  return {
    comment,
    number: positive(update.number) ?? numbers?.get(comment.cid),
    isReply: comment.depth > 0,
    tombstone,
    spoiler: signed.spoiler === true,
    pinned: update.pinned === true,
    locked: update.locked === true,
    userId: perPost && !tombstone && comment.author_address ? userIdFor(comment.author_address) : undefined,
    quotedCids: Array.isArray(signed.quotedCids)
      ? signed.quotedCids.filter((cid): cid is string => typeof cid === 'string')
      : [],
    media: tombstone
      ? undefined
      : mediaInfo(comment.link, comment.thumbnail_url, {
          tag: typeof signed.linkHtmlTagName === 'string' ? signed.linkHtmlTagName : undefined,
          width: positive(signed.linkWidth),
          height: positive(signed.linkHeight),
        }),
  };
}

/** 5chan's getShortAddress + formatUserIDForDisplay. */
function userIdFor(address: string): string {
  if (address.includes('.')) return address.length > 40 ? `${address.slice(0, 37)}...` : address;
  return address.length < 20 ? address : address.slice(8, 16);
}

/** 5chan's hashStringToColor / getTextColorForBackground, for the ID swatch. */
export function userIdColors(userId: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  const r = (hash >> 24) & 0xff;
  const g = (hash >> 16) & 0xff;
  const b = (hash >> 8) & 0xff;
  return { background: `rgb(${r}, ${g}, ${b})`, color: r * 0.299 + g * 0.587 + b * 0.114 > 125 ? 'black' : 'white' };
}

// ── media ───────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'jif', 'png', 'apng', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be', 'm.youtube.com', 'music.youtube.com']);

/** Only plain web URLs ever reach an href or src. */
export function httpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | undefined {
  if (!YOUTUBE_HOSTS.has(url.host)) return undefined;
  const fromQuery = url.searchParams.get('v');
  const id = fromQuery
    ?? (url.host.includes('youtu.be')
      ? url.pathname.slice(1).split('/')[0]
      : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]);
  return id && /^[\w-]{6,20}$/.test(id) ? id : undefined;
}

function mediaInfo(
  link: string | null,
  thumbnailUrl: string | null,
  hints: { tag?: string; width?: number; height?: number },
): MediaInfo | undefined {
  const url = httpUrl(link);
  if (!url) return undefined;
  const href = url.href;
  const thumbnail = httpUrl(thumbnailUrl)?.href;
  const dims = { width: hints.width, height: hints.height };

  const yt = youtubeId(url);
  if (yt) return { url: href, type: 'youtube', thumbnail: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`, youtubeId: yt };

  const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'gif') return { url: href, type: 'gif', thumbnail: href, ...dims };
  if (IMAGE_EXTENSIONS.has(extension) || hints.tag === 'img') return { url: href, type: 'image', thumbnail: href, ...dims };
  if (VIDEO_EXTENSIONS.has(extension) || hints.tag === 'video') return { url: href, type: 'video', thumbnail, ...dims };
  if (AUDIO_EXTENSIONS.has(extension) || hints.tag === 'audio') return { url: href, type: 'audio' };
  return { url: href, type: 'webpage', thumbnail };
}

/** 5chan's file-type label: "(image, 1280x590)". */
export function mediaLabel(media: MediaInfo): string {
  const type = media.type === 'youtube' ? 'youtube video' : media.type;
  if (media.type === 'youtube') return `${type}, 800x450`;
  return media.width && media.height ? `${type}, ${media.width}x${media.height}` : type;
}

/** Display name of the attached file: its filename when the URL has one. */
export function mediaFileName(media: MediaInfo): string {
  const last = new URL(media.url).pathname.split('/').pop() ?? '';
  const name = /\.\w+$/.test(last) && media.type !== 'webpage' ? decodeURIComponentSafe(last) : media.url;
  return truncateMiddle(name);
}

const decodeURIComponentSafe = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** 5chan's truncateWithEllipsisInMiddle. */
export function truncateMiddle(value: string, max = 50): string {
  if (value.length <= max) return value;
  const keep = max - 3;
  return `${value.slice(0, Math.ceil(keep / 2))}...${value.slice(value.length - Math.floor(keep / 2))}`;
}

/** Thumbnail box size, scaled like 5chan's CommentMedia (250px OP, 125px reply/mobile). */
export function thumbnailSize(media: MediaInfo, max: number): { width: number; height: number } {
  if (media.width && media.height) {
    const scale = Math.min(1, max / Math.max(media.width, media.height));
    return { width: Math.round(media.width * scale), height: Math.round(media.height * scale) };
  }
  return { width: max, height: max };
}

// ── time ────────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 5chan's post date, "10/01/26(Thu)07:02:40". Always UTC: these pages render on
 * the server, which has no idea where the reader is.
 */
export function formatPostDate(sec: number): string {
  const d = new Date(sec * 1000);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCFullYear() % 100)}(${DAYS[d.getUTCDay()]})${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export const isoDate = (sec: number) => new Date(sec * 1000).toISOString();
