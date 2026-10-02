import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApiDown } from '@/components/Notice';
import { UpstreamBoardForm } from '@/components/Upstream';
import type { ThreadPreview } from '@/lib/board-view';
import { formatShortDate, timeAgo } from '@/lib/format';
import { upstreamName } from '@/lib/site';
import { hasUpstream, upstreamBoardUrl, upstreamDirectoryUrl } from '@/lib/upstream';
import type { Theme } from '@/lib/theme';
import archive from '@/styles/archive.module.css';
import { BoardHeader } from './BoardHeader';
import { BoardsBar } from './BoardsBar';
import { Blotter, BoardButtons, Bracket, MobilePages, PageFooter, Pagelist, SearchOps } from './Chrome';
import footerStyles from '@/styles/5chan/footer.module.css';
import { type BoardLabelKind, Thread } from './Post';
import { QuotePreviews } from './QuotePreviews';
import { ThemeRoot } from './ThemeRoot';

/**
 * A board page as 5chan lays it out — boards bar, header, post form slot,
 * blotter, board buttons, fifteen threads with their last replies, and the
 * footer pagelist — for a directory code, one board inside a code, or /all/.
 */
export interface BoardViewProps {
  theme: Theme;
  /** Directory code, or undefined for the /all/ multiboard. */
  code?: string;
  /** Set on a single-board page: the board's address (inside `code`). */
  board?: string;
  /** Which board each thread is from, when the page mixes several. */
  boardLabel?: BoardLabelKind;
  /** 5chan's [Directory] button: the code's list of boards. */
  directoryHref?: string;
  /** Path of page 1; page N is `${basePath}/N`. */
  basePath: string;
  title: string;
  subtitle?: ReactNode;
  threads: ThreadPreview[] | null;
  page: number;
  totalPages: number;
  /** Total threads, and when the newest board in view was last crawled. */
  total: number;
  lastIndexedAt: number | null;
  /** Board addresses the threads come from, for the blotter. */
  sources: string[];
  head?: ReactNode;
}

/** The blotter's second line: where this page's board or code lives on 5chan. */
function UpstreamLine({ code, board, live }: { code: string; board?: string; live: number }) {
  const open = live > 0 ? `: ${live} of the threads on this page ${live === 1 ? 'is' : 'are'} still open there` : '';
  return board ? (
    <>
      {board} on {upstreamName}
      {open}. [<a href={upstreamBoardUrl(board)}>Open</a>]
    </>
  ) : (
    <>
      /{code}/ is live on {upstreamName}
      {open}. [<a href={upstreamDirectoryUrl(code)}>Open</a>]
    </>
  );
}

/** The blotter's two lines: what this page archives, and where it lives upstream. */
function BoardBlotter({ code, board, threads, total, lastIndexedAt, sources }: Pick<BoardViewProps, 'code' | 'board' | 'threads' | 'total' | 'lastIndexedAt' | 'sources'>) {
  const from = sources.length === 0 ? '' : sources.length <= 3 ? ` from ${sources.join(', ')}` : ` from ${sources.length} boards`;
  const crawled = lastIndexedAt ? ` Last crawled ${timeAgo(lastIndexedAt)}.` : '';
  const rows: { key: string; date?: string; text: ReactNode }[] = [
    {
      key: 'archive',
      date: lastIndexedAt ? formatShortDate(lastIndexedAt) : undefined,
      text: `${total} ${total === 1 ? 'thread' : 'threads'} archived${from}.${crawled}`,
    },
  ];
  if (hasUpstream && code) {
    const live = threads?.filter((t) => !t.op.comment.archived).length ?? 0;
    rows.push({ key: 'upstream', text: <UpstreamLine code={code} board={board} live={live} /> });
  }
  return <Blotter rows={rows} />;
}

export function BoardView(props: BoardViewProps) {
  const { theme, code, board, boardLabel, directoryHref, basePath, title, subtitle, threads, page, totalPages, head } = props;
  const pageHref = (n: number) => (n === 1 ? basePath : `${basePath}/${n}`);
  const catalogHref = `${basePath}/catalog`;
  const searchScope = board ?? code;
  return (
    <ThemeRoot theme={theme}>
      {head}
      <QuotePreviews />
      <span id="top" />
      <BoardsBar current={code ?? 'all'} />
      <BoardHeader title={title} subtitle={subtitle} />
      {code ? <UpstreamBoardForm code={code} board={board} /> : null}
      <BoardBlotter {...props} />
      <BoardButtons
        left={
          <>
            <SearchOps board={searchScope} /> <Bracket href={catalogHref}>Catalog</Bracket> <Bracket href="#bottom">Bottom</Bracket>
          </>
        }
        right={directoryHref ? <Bracket href={directoryHref}>Directory</Bracket> : undefined}
        mobile={
          <>
            <Link className="button" href={catalogHref}>
              Catalog
            </Link>{' '}
            <Link className="button" href={searchScope ? `/search?board=${encodeURIComponent(searchScope)}` : '/search'}>
              Search
            </Link>{' '}
            {directoryHref ? (
              <>
                <Link className="button" href={directoryHref}>
                  Directory
                </Link>{' '}
              </>
            ) : null}
            <Link className="button" href="#bottom">
              Bottom
            </Link>
          </>
        }
      />
      {threads === null ? (
        <ApiDown />
      ) : threads.length === 0 ? (
        <div className={archive.notice}>No threads archived on this board yet.</div>
      ) : (
        threads.map((t) => (
          <Thread
            key={t.op.comment.cid}
            op={t.op}
            replies={t.replies}
            links={t.links}
            mode="board"
            totalReplies={t.totalReplies}
            totalLinks={t.totalLinks}
            boardLabel={boardLabel}
          />
        ))
      )}
      <span id="bottom" />
      <PageFooter
        firstRow={
          totalPages > 0 ? (
            <Pagelist current={page} total={totalPages} href={pageHref} trailing={[{ href: catalogHref, label: 'Catalog' }]} />
          ) : null
        }
        mobile={
          <>
            <div className={footerStyles.mobileFooterButtons}>
              <Link className="button" href={catalogHref}>
                Catalog
              </Link>{' '}
              <Link className="button" href="#top">
                Top
              </Link>
            </div>
            <MobilePages current={page} total={totalPages} href={pageHref} />
          </>
        }
      />
    </ThemeRoot>
  );
}
