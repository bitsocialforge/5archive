import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { boardPage, getCommunities, getCommunity } from './api';
import { adHocDirectory, archivedBoards, type Directory, directoryForAddress, getDirectory } from './directories';
import type { Community } from './types';

/** Shared by a board's pages (/biz, /biz/2), its catalog and its directory, like 5chan's board routes. */

/** What a board URL lists: a whole directory code, or one of the boards inside it. */
export interface BoardScope {
  /** The code's directory, or an ad-hoc one for a board that never held a code. */
  dir: Directory;
  /** Addresses whose threads the page lists. */
  boards: string[];
  /** The page's URL segment: the code, or the board's address on a single-board page. */
  segment: string;
  /** Set on a single-board page: the board's address. */
  board?: string;
}

/**
 * Resolve the URL segment to what it lists:
 *
 * - a directory code: every board ever archived under it;
 * - the address of one board in a code shared by several: just that board, as
 *   5chan keeps a non-winning candidate on its own address route. Its threads
 *   still live at /<code>/thread/<cid>; this page is only a filter;
 * - the address of a code's only board: a redirect to the code, so it has one URL;
 * - the address of a board that never held a code: that board.
 */
export async function resolveBoard(segment: string, suffix = ''): Promise<BoardScope> {
  const dir = getDirectory(segment);
  if (dir) return { dir, boards: archivedBoards(dir), segment: dir.code };

  const coded = directoryForAddress(segment);
  if (coded) {
    const boards = archivedBoards(coded);
    if (boards.length > 1 && boards.includes(segment)) return { dir: coded, boards: [segment], segment, board: segment };
    permanentRedirect(`/${coded.code}${suffix}`);
  }

  const community = await getCommunity(segment);
  if (!community) notFound();
  const adHoc = adHocDirectory(community);
  return { dir: adHoc, boards: adHoc.boards, segment: adHoc.code };
}

/**
 * The indexed boards a scope covers, from one cached /api/communities call
 * however many boards a code has collected, and the ones worth listing threads
 * from (a board with nothing archived would only cost a request). If the call
 * fails, every board is tried.
 */
export async function scopeBoards(scope: BoardScope): Promise<{ known: Map<string, Community>; indexed: Community[]; withThreads: string[] }> {
  const communities = (await getCommunities())?.communities ?? null;
  const known = new Map((communities ?? []).map((c) => [c.address, c]));
  const indexed = scope.boards.map((address) => known.get(address)).filter((c): c is Community => c !== undefined);
  const withThreads = communities ? indexed.filter((c) => c.post_count > 0).map((c) => c.address) : scope.boards;
  return { known, indexed, withThreads };
}

/** A page of a scope's threads, newest first, with the boards behind them. */
export async function scopeListing(scope: BoardScope, page: number, perPage: number) {
  const boards = await scopeBoards(scope);
  const listing = boards.withThreads.length > 0 ? await boardPage(boards.withThreads, page, perPage) : { posts: [], total: 0 };
  return { ...boards, listing };
}

/** Shared with the page's structured data, so the two can't describe it differently. */
export const describeBoard = (dir: Directory) =>
  `Archived 5chan threads from ${dir.title}, permanently readable and searchable.`;

export const scopePath = (scope: BoardScope) => `/${encodeURIComponent(scope.segment)}`;

export async function boardMetadata(segment: string, page: number): Promise<Metadata> {
  const scope = await resolveBoard(segment);
  const base = scope.board ? `${scope.board} - ${scope.dir.title}` : scope.dir.title;
  const title = page > 1 ? `${base} - Page ${page}` : base;
  const description = scope.board
    ? `Archived 5chan threads from ${scope.board}, one of the boards archived under ${scope.dir.title}.`
    : describeBoard(scope.dir);
  const canonical = `${scopePath(scope)}${page > 1 ? `/${page}` : ''}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary', title, description },
    // A single board's page repeats a slice of its code's pages, which are the ones to index.
    robots: scope.board ? { index: false, follow: true } : undefined,
  };
}
