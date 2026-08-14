import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ApiDown } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';
import { getCommunity, getPosts } from '@/lib/api';
import { adHocDirectory, type Directory, directoryForAddress, getDirectory } from '@/lib/directories';

// Cache the rendered page; identical fetches are deduped with generateMetadata.
export const revalidate = 5;

const THREADS_PER_PAGE = 50;

type Params = { params: Promise<{ dir: string }> };

/**
 * Resolve the URL segment to a directory: a 5chan directory code, or — for a
 * board upstream has dropped from the lists — the board's own address. An
 * address that does have a code redirects to it, so each board has one URL.
 */
async function resolveDirectory(segment: string): Promise<Directory> {
  const dir = getDirectory(segment);
  if (dir) return dir;

  const coded = directoryForAddress(segment);
  if (coded) permanentRedirect(`/${coded.code}`);

  const community = await getCommunity(segment);
  if (!community) notFound();
  return adHocDirectory(community);
}

/** Threads across every board holding the code, newest first. */
async function directoryThreads(dir: Directory) {
  const pages = await Promise.all(
    dir.boards.map((address) =>
      getPosts(`?community=${encodeURIComponent(address)}&sort=new&limit=${THREADS_PER_PAGE}`, 5),
    ),
  );
  if (pages.every((page) => page === null)) return null;
  return pages
    .flatMap((page) => page?.posts ?? [])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, THREADS_PER_PAGE);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { dir: segment } = await params;
  const dir = await resolveDirectory(decodeURIComponent(segment));

  const title = dir.title;
  const description = `Archived 5chan threads from ${dir.title}, permanently readable and searchable.`;
  const canonical = `/${encodeURIComponent(dir.code)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary', title, description },
  };
}

export default async function DirectoryPage({ params }: Params) {
  const { dir: segment } = await params;
  const dir = await resolveDirectory(decodeURIComponent(segment));

  const [threads, boards] = await Promise.all([
    directoryThreads(dir),
    Promise.all(dir.boards.map((address) => getCommunity(address))),
  ]);

  if (threads === null) return <ApiDown />;

  const indexed = boards.filter((b) => b !== null);
  const total = indexed.reduce((sum, b) => sum + b.post_count, 0);

  return (
    <div>
      <div className="results-head">
        <h1>{dir.title}</h1>
        <p>
          {total} {total === 1 ? 'thread' : 'threads'} archived
          {indexed.length > 0 ? ` · ${indexed.map((b) => b.address).join(' · ')}` : ''}
        </p>
      </div>
      {threads.length === 0 ? (
        <div className="notice">No threads indexed for this directory yet.</div>
      ) : (
        threads.map((post) => <PostCard key={post.cid} post={post} />)
      )}
    </div>
  );
}
