import { isCommunities, isCommunity, isHealth, isPostPage, isSearchResult, isThread } from './api-contract.ts';
import { showNsfw } from './site.ts';
import type { Comment } from './types.ts';

const BASE = process.env.INDEXER_API ?? 'http://localhost:4000';

/**
 * Fetch JSON from the indexer API; returns null on any failure (API down, 404…).
 * `revalidate` (seconds) opts the request into Next's data cache so SSR pages
 * don't hit the API on every request; omit it for uncached (no-store) fetches.
 */
async function get<T>(path: string, isExpected: (value: unknown) => value is T, revalidate?: number): Promise<T | null> {
  try {
    const res = await fetch(
      `${BASE}${path}`,
      revalidate === undefined ? { cache: 'no-store' } : { next: { revalidate } },
    );
    if (!res.ok) return null;
    const value: unknown = await res.json();
    return isExpected(value) ? value : null;
  } catch {
    return null;
  }
}

export const apiBase = BASE;

export const getHealth = () => get('/api/health', isHealth, 60);
export const getCommunities = (revalidate = 5) => get('/api/communities', isCommunities, revalidate);
export const getCommunity = (address: string, revalidate = 5) =>
  get(`/api/communities/${encodeURIComponent(address)}`, isCommunity, revalidate);
export const getPosts = (query = '', revalidate = 5) => get(`/api/posts${query}`, isPostPage, revalidate);
export const getThread = (cid: string, revalidate = 5) => get(`/api/posts/${encodeURIComponent(cid)}`, isThread, revalidate);
export type SearchStatus = 'all' | 'active' | 'archived';

// `nsfw` is always sent: the API excludes NSFW when the parameter is absent, so
// leaving it off would make every instance inherit that default silently. See
// SHOW_NSFW in lib/site.ts.
export const search = (q: string, { community, page = 1, limit = 25, status = 'all' }: {
  community?: string; page?: number; limit?: number; status?: SearchStatus;
} = {}) => {
  const params = new URLSearchParams({ q, nsfw: String(showNsfw), page: String(page), limit: String(limit), status });
  if (community) params.set('community', community);
  return get(`/api/search?${params}`, isSearchResult);
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
