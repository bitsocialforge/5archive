import { upstreamUrl } from './site';
import type { Comment } from './types';

/**
 * Links back to the live network this archive mirrors (5chan).
 *
 * The archive exists because 5chan is a client-rendered single-page app: search
 * engines only ever see its shell, so 5chan's own threads can't rank. These
 * server-rendered pages can. That makes 5archive the entry point for search
 * traffic and the only place purged threads survive — which is exactly why it
 * must not redirect that traffic onward: a redirect would hand the ranking back
 * to a page Google can't read, and serving one only to humans is cloaking. The
 * page stays; the links below are the way out of it.
 *
 * Upstream is optional. Both UPSTREAM_NAME and UPSTREAM_URL must be set (see
 * lib/site.ts) or nothing upstream-facing renders at all.
 */
export { hasUpstream } from './site';

/**
 * 5chan is hash-routed, so the entire route lives in the fragment: `#/<board>`,
 * `#/<board>/thread/<cid>`. Fragments never reach a server, which is harmless
 * here — these stay ordinary crawlable links to the app's origin — but it does
 * mean the destination is invisible to anything but a browser.
 *
 * The board segment is always the board ADDRESS, never the directory code.
 * Codes are contested upstream: several boards compete for /biz/, the
 * highest-scoring one resolves it, and 5chan rotates to another when that board
 * goes offline (see lib/directories.ts). A code therefore can — and today does
 * — resolve to a different board than the one a given thread was archived from.
 * The address always lands on the right board.
 */
export const upstreamBoardUrl = (address: string) => `${upstreamUrl}/#/${encodeURIComponent(address)}`;

/**
 * Directory-code URL, for pages whose subject is the code itself rather than
 * one board — the archive's /biz page aggregates every board holding the code,
 * so it maps to whichever board 5chan currently resolves the code to.
 */
export const upstreamDirectoryUrl = (code: string) => `${upstreamUrl}/#/${encodeURIComponent(code)}`;

/**
 * Permalink to a post upstream. Like the archive's own routes, 5chan puts a
 * reply's own cid in the thread slot and resolves the root thread from it.
 */
export const upstreamThreadUrl = (post: Pick<Comment, 'cid' | 'community_address'>) =>
  `${upstreamBoardUrl(post.community_address)}/thread/${encodeURIComponent(post.cid)}`;

/**
 * Whether a thread can still be opened upstream.
 *
 * 5chan purges threads 48 hours after they're archived, and the indexer flips
 * `archived` once a thread stops coming back from a crawl — so this really does
 * track reachability, not just staleness. It matters because a purged thread is
 * worse than a 404 on a p2p network: the app would sit on a fetch that never
 * resolves. Threads that are gone get sent to their board instead, which is
 * also where a reader who wants to post has to end up anyway.
 */
export const isLiveUpstream = (post: Pick<Comment, 'archived'>) => !post.archived;
