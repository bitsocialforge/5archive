import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BoardView } from '@/components/chan/BoardView';
import { JsonLd } from '@/components/JsonLd';
import { THREADS_PER_PAGE, threadPreviews } from '@/lib/board-view';
import { type BoardScope, describeBoard, resolveBoard, scopeListing, scopePath } from '@/lib/board-route';
import { archivedBoards, getDirectory } from '@/lib/directories';
import { boardTheme } from '@/lib/theme';
import { boardGraph } from '@/lib/jsonld';
import type { Community } from '@/lib/types';

/** Under the title: a code's boards, or where a single board sits in its code. */
function ScopeSubtitle({ scope, indexed, known }: { scope: BoardScope; indexed: Community[]; known: Map<string, Community> }) {
  const { dir, board } = scope;
  if (board) {
    const title = known.get(board)?.title?.trim();
    // Many boards are titled after the code they compete for; that adds nothing here.
    const ownTitle = title && title !== `/${dir.code}/` ? title : undefined;
    return (
      <>
        {ownTitle ? `${ownTitle} · ` : ''}one of {archivedBoards(dir).length} boards archived under{' '}
        <Link href={`/${encodeURIComponent(dir.code)}`}>/{dir.code}/</Link>
      </>
    );
  }
  if (indexed.length > 3) return <>{indexed.length} boards</>;
  return indexed.length > 0 ? <>{indexed.map((b) => b.address).join(' · ')}</> : null;
}

/** A board's page N; shared by its first page (/biz) and the rest (/biz/2). */
export async function BoardRoute({ segment, page }: { segment: string; page: number }) {
  const scope = await resolveBoard(segment, page > 1 ? `/${page}` : '');
  const { dir, board } = scope;

  const { known, indexed, listing } = await scopeListing(scope, page, THREADS_PER_PAGE);
  // Past the last page there is no page: 404 rather than an empty board.
  if (listing && page > 1 && listing.posts.length === 0) notFound();

  const total = listing?.total ?? indexed.reduce((sum, b) => sum + b.post_count, 0);
  const lastIndexedAt = Math.max(0, ...indexed.map((b) => b.last_indexed_at ?? 0)) || null;
  const isCode = getDirectory(dir.code) !== null;
  const codeBoards = archivedBoards(dir).length;

  return (
    <BoardView
      theme={boardTheme(indexed)}
      code={dir.code}
      board={board}
      boardLabel={!board && codeBoards > 1 ? 'address' : undefined}
      directoryHref={isCode ? `/${encodeURIComponent(dir.code)}/directory` : undefined}
      basePath={scopePath(scope)}
      // A code can collect any number of boards, often titled alike: the address tells them apart.
      title={board ?? dir.title}
      subtitle={<ScopeSubtitle scope={scope} indexed={indexed} known={known} />}
      threads={listing ? await threadPreviews(listing.posts) : null}
      page={page}
      totalPages={Math.max(1, Math.ceil(total / THREADS_PER_PAGE))}
      total={total}
      lastIndexedAt={lastIndexedAt}
      sources={indexed.map((b) => b.address)}
      head={page === 1 && !board ? <JsonLd graph={boardGraph(dir.code, dir.title, describeBoard(dir))} /> : null}
    />
  );
}
