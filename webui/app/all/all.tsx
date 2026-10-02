import { notFound } from 'next/navigation';
import { BoardView } from '@/components/chan/BoardView';
import { getCommunities, getPosts } from '@/lib/api';
import { THREADS_PER_PAGE, threadPreviews } from '@/lib/board-view';
import { multiboardTheme } from '@/lib/theme';

/** 5chan's /all/ multiboard: every board's threads, newest first, with board labels. */
export async function AllRoute({ page }: { page: number }) {
  const [listing, communities] = await Promise.all([
    getPosts(`?sort=new&limit=${THREADS_PER_PAGE}&page=${page}`),
    getCommunities(),
  ]);
  if (listing && page > 1 && listing.posts.length === 0) notFound();

  const boards = communities?.communities ?? [];
  const total = listing?.total ?? 0;
  const lastIndexedAt = Math.max(0, ...boards.map((b) => b.last_indexed_at ?? 0)) || null;

  return (
    <BoardView
      theme={multiboardTheme}
      basePath="/all"
      title="/all/ - All Archived Boards"
      subtitle={`Every archived thread from ${boards.length} ${boards.length === 1 ? 'board' : 'boards'}, newest first.`}
      threads={listing ? await threadPreviews(listing.posts) : null}
      page={page}
      totalPages={Math.max(1, Math.ceil(total / THREADS_PER_PAGE))}
      total={total}
      lastIndexedAt={lastIndexedAt}
      sources={[]}
      boardLabel="code"
    />
  );
}
