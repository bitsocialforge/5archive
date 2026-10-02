import type { Metadata } from 'next';
import Link from 'next/link';
import { BoardHeader } from '@/components/chan/BoardHeader';
import { BoardsBar } from '@/components/chan/BoardsBar';
import { Bracket, MobilePages, PageFooter, Pagelist } from '@/components/chan/Chrome';
import { Thread } from '@/components/chan/Post';
import { QuotePreviews } from '@/components/chan/QuotePreviews';
import { StatusSelect } from '@/components/chan/StatusSelect';
import { ThemeRoot } from '@/components/chan/ThemeRoot';
import { ApiDown } from '@/components/Notice';
import { getThread, search, type SearchStatus } from '@/lib/api';
import { standalone, type ThreadPreview } from '@/lib/board-view';
import { archivedBoards, directoryForAddress, getDirectory } from '@/lib/directories';
import { embeddedNumbers, postView } from '@/lib/post';
import { siteName } from '@/lib/site';
import { multiboardTheme } from '@/lib/theme';
import { threadLinks } from '@/lib/thread';
import type { Comment, SearchResult } from '@/lib/types';
import archive from '@/styles/archive.module.css';
import styles from '@/styles/5chan/search.module.css';

type SearchParams = { searchParams: Promise<{ q?: string; board?: string; page?: string; status?: string }> };

const RESULTS_PER_PAGE = 25;
const STATUSES: SearchStatus[] = ['active', 'archived', 'all'];

export async function generateMetadata({ searchParams }: SearchParams): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  return {
    title: query ? `${query} — search` : 'Search',
    alternates: { canonical: '/search' },
    // Result pages are infinite query-space; keep them out of the index.
    robots: query ? { index: false, follow: true } : undefined,
  };
}

/** One search across the boards a code holds (usually one), newest relevance order per board. */
async function searchBoards(query: string, boards: string[] | undefined, page: number, status: SearchStatus): Promise<SearchResult | null> {
  if (!boards) return search(query, { page, limit: RESULTS_PER_PAGE, status });
  const results = await Promise.all(boards.map((community) => search(query, { community, page, limit: RESULTS_PER_PAGE, status })));
  if (results.every((r) => r === null)) return null;
  return {
    query,
    page,
    limit: RESULTS_PER_PAGE,
    posts: results.flatMap((r) => r?.posts ?? []),
    total: results.reduce((sum, r) => sum + (r?.total ?? 0), 0),
  };
}

/**
 * Like 5chan's search view, a reply hit is shown inside its thread: the OP,
 * then the matching reply. Thread fetches are the same cached ones the thread
 * pages make.
 */
async function resultThreads(posts: Comment[]): Promise<ThreadPreview[]> {
  return Promise.all(
    posts.map(async (post) => {
      if (post.depth === 0) return standalone(post);
      const thread = await getThread(post.post_cid);
      if (!thread) return standalone(post);
      const op = postView(thread.post);
      const numbers = embeddedNumbers(thread.post);
      const all = thread.replies.map((reply) => postView(reply, numbers));
      const hit = all.find((r) => r.comment.cid === post.cid) ?? postView(post);
      return {
        op,
        replies: [hit],
        links: threadLinks(op, all, new Set([op.comment.cid, hit.comment.cid])),
        totalReplies: all.length,
        totalLinks: all.filter((r) => r.media).length,
      };
    }),
  );
}

/** What `?board=` narrows a search to: a code's every board, or one board inside a code. */
interface SearchScope {
  /** The `board` value, which is also the scope page's URL segment. */
  param: string;
  label: string;
  boards: string[];
}

function searchScope(board: string): SearchScope | null {
  const dir = getDirectory(board);
  if (dir) return { param: dir.code, label: `/${dir.code}/`, boards: archivedBoards(dir) };
  const coded = directoryForAddress(board);
  return coded && archivedBoards(coded).includes(board) ? { param: board, label: board, boards: [board] } : null;
}

/** The query string, read the way the page links it back. */
function parseSearch(params: Awaited<SearchParams['searchParams']>) {
  const query = (params.q ?? '').trim();
  const dir = params.board ? searchScope(params.board) : null;
  const status: SearchStatus = STATUSES.includes(params.status as SearchStatus) ? (params.status as SearchStatus) : 'all';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const href = ({ page: p = 1, status: s = status }: { page?: number; status?: SearchStatus }) => {
    const next = new URLSearchParams({ q: query });
    if (dir) next.set('board', dir.param);
    if (s !== 'all') next.set('status', s);
    if (p > 1) next.set('page', String(p));
    return `/search?${next}`;
  };
  return { query, dir, status, page, href };
}

/** 5chan's search header: "/search/ - Archive Search", or the query and its scope. */
function searchHeading(query: string, dir: SearchScope | null, result: SearchResult | null) {
  const scope = dir ? dir.label : siteName;
  return {
    title: query ? `${scope} Search “${query}”` : dir ? `${dir.label} - Search` : '/search/ - Archive Search',
    subtitle: result ? `${result.total} ${result.total === 1 ? 'result' : 'results'}` : 'Search archived posts across every board.',
  };
}

/** 5chan's search box (find.4chan.org's sizes), as a plain GET form. */
function SearchForm({ query, dir, status }: { query: string; dir: SearchScope | null; status: SearchStatus }) {
  return (
    <form className={styles.searchForm} role="search" action="/search" method="get">
      <input
        type="text"
        name="q"
        defaultValue={query}
        autoComplete="off"
        maxLength={500}
        aria-label={dir ? `Search archived posts on ${dir.label}` : 'Search archived posts across every board'}
        placeholder={dir ? `Search archived posts on ${dir.label}.` : 'Search archived posts across every board.'}
      />
      {dir ? <input type="hidden" name="board" value={dir.param} /> : null}
      {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
      <button type="submit">Search</button>
    </form>
  );
}

function SearchResults({ result, threads }: { result: SearchResult; threads: ThreadPreview[] }) {
  if (result.posts.length === 0) return <div className={styles.empty}>No archived posts matched. Try broader terms.</div>;
  return (
    <div className={styles.results}>
      {threads.map((t) => (
        <Thread
          key={t.replies[0]?.comment.cid ?? t.op.comment.cid}
          op={t.op}
          replies={t.replies}
          links={t.links}
          mode="board"
          totalReplies={t.totalReplies}
          totalLinks={t.totalLinks}
          boardLabel="code"
        />
      ))}
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchParams) {
  const { query, dir, status, page, href } = parseSearch(await searchParams);

  const result = query ? await searchBoards(query, dir?.boards, page, status) : null;
  const apiDown = query !== '' && result === null;
  const threads = result ? await resultThreads(result.posts) : [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / RESULTS_PER_PAGE)) : 0;

  const { title, subtitle } = searchHeading(query, dir, result);
  const returnHref = dir ? `/${encodeURIComponent(dir.param)}` : '/';

  return (
    <ThemeRoot theme={multiboardTheme}>
      <QuotePreviews />
      <span id="top" />
      <BoardsBar current="search" />
      <BoardHeader title={title} subtitle={subtitle} />
      <main className={styles.page}>
        <SearchForm query={query} dir={dir} status={status} />
        <hr className={styles.desktopDivider} />
        <div className={styles.desktopNavLinks}>
          <Bracket href={returnHref}>Return</Bracket>
          {query ? (
            <span className={styles.rightSideButtons}>
              <label className={styles.postStatus}>
                Posts:&nbsp;
                <StatusSelect value={status} hrefs={Object.fromEntries(STATUSES.map((s) => [s, href({ status: s })]))} />
              </label>
            </span>
          ) : null}
        </div>
        <div className={styles.mobileNavLinks}>
          <Link className="button" href={returnHref}>
            Return
          </Link>
        </div>
        {apiDown ? <ApiDown /> : null}
        {result ? <SearchResults result={result} threads={threads} /> : null}
        {!query && !apiDown ? <div className={archive.notice}>Search titles and comments of every archived thread and reply.</div> : null}
      </main>
      <PageFooter
        firstRow={result && totalPages > 1 ? <Pagelist current={page} total={totalPages} href={(p) => href({ page: p })} /> : null}
        mobile={result ? <MobilePages current={page} total={totalPages} href={(p) => href({ page: p })} /> : null}
      />
    </ThemeRoot>
  );
}
