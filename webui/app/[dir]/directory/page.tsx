import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { BoardHeader } from '@/components/chan/BoardHeader';
import { BoardsBar } from '@/components/chan/BoardsBar';
import { Bracket, MobilePages, PageFooter, Pagelist } from '@/components/chan/Chrome';
import { ThemeRoot } from '@/components/chan/ThemeRoot';
import { getPosts } from '@/lib/api';
import { resolveBoard, scopeBoards } from '@/lib/board-route';
import { archivedBoards, type Directory, getDirectory } from '@/lib/directories';
import { formatShortDate } from '@/lib/format';
import { boardTheme } from '@/lib/theme';
import type { Community } from '@/lib/types';
import archive from '@/styles/archive.module.css';
import styles from '@/styles/5chan/directory-layout.module.css';

// The board list changes with the lists repo and the crawl, not by the second.
export const revalidate = 300;

/** Rows per page: a code can collect any number of boards over the years. */
const BOARDS_PER_PAGE = 50;

type Props = { params: Promise<{ dir: string }>; searchParams: Promise<{ page?: string }> };

const pageOf = (value: string | undefined) => Math.max(1, Number.parseInt(value ?? '1', 10) || 1);

/** A code's directory; a board address inside one redirects to its code's directory. */
async function resolveCode(segment: string): Promise<Directory> {
  const scope = await resolveBoard(segment, '/directory');
  if (scope.board) permanentRedirect(`/${scope.dir.code}/directory`);
  if (!getDirectory(scope.dir.code)) notFound();
  return scope.dir;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const dir = await resolveCode(decodeURIComponent((await params).dir));
  const page = pageOf((await searchParams).page);
  const title = `/${dir.code}/ - Directory`;
  const description = `Every 5chan board archived under /${dir.code}/: the ones listed for the code today and the ones that have left its list.`;
  const canonical = `/${encodeURIComponent(dir.code)}/directory`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: page > 1 ? { index: false, follow: true } : undefined,
  };
}

interface Row {
  address: string;
  /** Position in the code's current list, best score first; undefined for a board that left it. */
  rank?: number;
  community?: Community;
  oldest?: number;
  newest?: number;
}

/** The first and last thread a board has in the archive, when it has any. */
async function activity(address: string, community: Community | undefined) {
  if (!community || community.post_count === 0) return {};
  const [newest, oldest] = await Promise.all([
    getPosts(`?community=${encodeURIComponent(address)}&sort=new&limit=1`, revalidate),
    getPosts(`?community=${encodeURIComponent(address)}&sort=old&limit=1`, revalidate),
  ]);
  return { newest: newest?.posts[0]?.timestamp, oldest: oldest?.posts[0]?.timestamp };
}

function DirectoryRow({ row, index, single, code }: { row: Row; index: number; single: boolean; code: string }) {
  const { address, rank, community, oldest, newest } = row;
  return (
    <tr className={`${styles.dirRow} ${index % 2 === 1 ? `${styles.rowOdd} ${archive.directoryRowOdd}` : ''}`}>
      <td className={styles.numberCell}>{rank ?? '–'}</td>
      <td className={styles.boardCol}>{address}</td>
      <td className={styles.statusCell}>
        {rank !== undefined ? (
          <span className={styles.statusOnline}>Listed</span>
        ) : (
          <span className={styles.statusOffline} title={`No longer in 5chan's /${code}/ list; its threads stay archived under /${code}/`}>
            Left
          </span>
        )}
      </td>
      <td className={styles.scoreCell}>{community ? community.post_count : '–'}</td>
      <td className={styles.ownerCell}>{oldest && newest ? `${formatShortDate(oldest)} – ${formatShortDate(newest)}` : '–'}</td>
      <td className={styles.actionsCell}>
        <Link href={single ? `/${encodeURIComponent(code)}` : `/${encodeURIComponent(address)}`} className={styles.viewLink}>
          View
        </Link>
      </td>
    </tr>
  );
}

export default async function DirectoryPage({ params, searchParams }: Props) {
  const dir = await resolveCode(decodeURIComponent((await params).dir));
  const page = pageOf((await searchParams).page);
  const all = archivedBoards(dir);
  const totalPages = Math.max(1, Math.ceil(all.length / BOARDS_PER_PAGE));
  if (page > totalPages) notFound();

  const { known, indexed } = await scopeBoards({ dir, boards: all, segment: dir.code });
  const slice = all.slice((page - 1) * BOARDS_PER_PAGE, page * BOARDS_PER_PAGE);
  const rows: Row[] = await Promise.all(
    slice.map(async (address) => {
      const community = known.get(address);
      const listed = dir.boards.indexOf(address);
      return { address, rank: listed === -1 ? undefined : listed + 1, community, ...(await activity(address, community)) };
    }),
  );

  const board = `/${encodeURIComponent(dir.code)}`;
  const href = (n: number) => `${board}/directory${n > 1 ? `?page=${n}` : ''}`;
  const nav = (
    <div className={styles.navButtonGroup}>
      <span>
        <Bracket href={board}>Return</Bracket>
      </span>
      <span>
        <Bracket href={`${board}/catalog`}>Catalog</Bracket>
      </span>
      <span>
        <Bracket href="#bottom">Bottom</Bracket>
      </span>
    </div>
  );

  return (
    <ThemeRoot theme={boardTheme(indexed)}>
      <span id="top" />
      <BoardsBar current={dir.code} />
      <BoardHeader title={dir.title} subtitle="Directory" />
      <div className={styles.page}>
        <div className={styles.directoryIntro}>
          Every board that has competed for /{dir.code}/ on 5chan. 5chan opens /{dir.code}/ on the highest-ranked listed board that is
          online; the archive keeps all of them, including boards that have left the list, under <Link href={board}>/{dir.code}/</Link>.
        </div>
        <hr className={styles.desktopDivider} />
        <div className={styles.desktopNavLinks}>{nav}</div>
        <div className={styles.mobileNavLinks}>
          <Link className="button" href={board}>
            Return
          </Link>{' '}
          <Link className="button" href={`${board}/catalog`}>
            Catalog
          </Link>
        </div>
        <hr className={styles.divider} />
        <h4 className={styles.directorySummary}>
          Displaying all ({all.length}) archived /{dir.code}/ {all.length === 1 ? 'board' : 'boards'}
        </h4>
        <table className={`${styles.flashListing} ${archive.directoryTable}`}>
          <thead>
            <tr>
              <th className={styles.postblock} scope="col">
                No.
              </th>
              <th className={styles.postblock} scope="col">
                Board
              </th>
              <th className={styles.postblock} scope="col">
                Status
              </th>
              <th className={styles.postblock} scope="col">
                Threads
              </th>
              <th className={styles.postblock} scope="col">
                Active
              </th>
              <th className={styles.postblock} scope="col">
                <span className="sr-only">View</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <DirectoryRow key={row.address} row={row} index={index} single={all.length === 1} code={dir.code} />
            ))}
          </tbody>
        </table>
      </div>
      <span id="bottom" />
      <PageFooter
        firstRow={totalPages > 1 ? <Pagelist current={page} total={totalPages} href={href} trailing={[{ href: board, label: 'Return' }]} /> : nav}
        mobile={<MobilePages current={page} total={totalPages} href={href} />}
      />
    </ThemeRoot>
  );
}
