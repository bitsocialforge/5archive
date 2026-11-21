import { isCommunities, isCommunity, isHealth, isPostPage, isSearchResult, isThread } from './api-contract.ts';
import { showNsfw } from './site.ts';
import type { Comment } from './types.ts';

const BASE = process.env.INDEXER_API ?? 'http://localhost:4000';

/**
 * Fetch JSON from the indexer API. Resolves null only when the API answers 404
 * (no such record); throws when it cannot answer: a network error, any other
 * status, or a body that is not the expected shape.
 * `revalidate` (seconds) opts the request into Next's data cache so SSR pages
 * don't hit the API on every request; omit it for uncached (no-store) fetches.
 */
async function find<T>(path: string, isExpected: (value: unknown) => value is T, revalidate?: number): Promise<T | null> {
  const res = await fetch(
    `${BASE}${path}`,
    revalidate === undefined ? { cache: 'no-store' } : { next: { revalidate } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Indexer API ${path} answered HTTP ${res.status}`);
  const value: unknown = await res.json();
  if (!isExpected(value)) throw new Error(`Indexer API ${path} returned an unexpected response`);
  return value;
}

/** Like find, for a listing that always exists: a 404 is a failure too. */
async function load<T>(path: string, isExpected: (value: unknown) => value is T, revalidate?: number): Promise<T> {
  const value = await find(path, isExpected, revalidate);
  if (value === null) throw new Error(`Indexer API ${path} answered HTTP 404`);
  return value;
}

/** For pages that render ApiDown or a fallback: null on any failure (API down, 404…). */
const orNull = <T>(request: Promise<T>): Promise<T | null> => request.catch(() => null);

export const apiBase = BASE;

// Strict lookups, for routes whose answer depends on whether a record exists
// (thread and legacy redirects, ad-hoc boards, sitemaps): null means the indexer
// has no such record, and an outage throws, so the route answers a retryable
// 5xx instead of a 404 or an emptied sitemap.
export const findCommunity = (address: string, revalidate = 5) =>
  find(`/api/communities/${encodeURIComponent(address)}`, isCommunity, revalidate);
export const findThread = (cid: string, revalidate = 5) => find(`/api/posts/${encodeURIComponent(cid)}`, isThread, revalidate);
export const loadCommunities = (revalidate = 5) => load('/api/communities', isCommunities, revalidate);
export const loadPosts = (query = '', revalidate = 5) => load(`/api/posts${query}`, isPostPage, revalidate);

export const getHealth = () => orNull(load('/api/health', isHealth, 60));
export const getCommunities = (revalidate = 5) => orNull(loadCommunities(revalidate));
export const getCommunity = (address: string, revalidate = 5) => orNull(findCommunity(address, revalidate));
export const getPosts = (query = '', revalidate = 5) => orNull(loadPosts(query, revalidate));
export const getThread = (cid: string, revalidate = 5) => orNull(findThread(cid, revalidate));
export type SearchStatus = 'all' | 'active' | 'archived';

// `nsfw` is always sent: the API excludes NSFW when the parameter is absent, so
// leaving it off would make every instance inherit that default silently. See
// SHOW_NSFW in lib/site.ts.
export const search = (q: string, { community, page = 1, limit = 25, status = 'all' }: {
  community?: string; page?: number; limit?: number; status?: SearchStatus;
} = {}) => {
  const params = new URLSearchParams({ q, nsfw: String(showNsfw), page: String(page), limit: String(limit), status });
  if (community) params.set('community', community);
  return orNull(load(`/api/search?${params}`, isSearchResult));
};

/** The API caps a page at this many posts. */
const API_PAGE_LIMIT = 100;

/**
 * One page of threads, newest first, across every board holding a directory
 * code. A single board pages through the API directly. Several boards (a
 * contested code) are merged: page N needs the newest N×perPage threads of the
 * union, which are among the newest N×perPage of each board.
 */
export async function boardPage(
  boards: string[],
  page: number,
  perPage: number,
  revalidate = 5,
): Promise<{ posts: Comment[]; total: number } | null> {
  const [onlyBoard] = boards;
  if (boards.length === 1 && onlyBoard !== undefined) {
    const res = await getPosts(`?community=${encodeURIComponent(onlyBoard)}&sort=new&limit=${perPage}&page=${page}`, revalidate);
    return res ? { posts: res.posts, total: res.total } : null;
  }

  const need = page * perPage;
  const perBoard = await Promise.all(
    boards.map(async (address) => {
      const posts: Comment[] = [];
      let total = 0;
      for (let p = 1; posts.length < need; p++) {
        const res = await getPosts(`?community=${encodeURIComponent(address)}&sort=new&limit=${API_PAGE_LIMIT}&page=${p}`, revalidate);
        if (!res) return null;
        total = res.total;
        posts.push(...res.posts);
        if (res.posts.length < API_PAGE_LIMIT) break;
      }
      return { posts, total };
    }),
  );
  if (perBoard.every((b) => b === null)) return null;
  const merged = perBoard
    .flatMap((b) => b?.posts ?? [])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice((page - 1) * perPage, page * perPage);
  return { posts: merged, total: perBoard.reduce((sum, b) => sum + (b?.total ?? 0), 0) };
}
