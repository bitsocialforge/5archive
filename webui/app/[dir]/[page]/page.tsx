import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { boardMetadata } from '@/lib/board-route';
import { BoardRoute } from '../board';

// Cache the rendered page; identical fetches are deduped with generateMetadata.
export const revalidate = 5;

type Params = { params: Promise<{ dir: string; page: string }> };

/** 5chan's board pages: /biz/2, /biz/3… Page 1 lives at /biz. */
function pageNumber(segment: string, dir: string): number {
  if (!/^\d+$/.test(segment)) notFound();
  const page = Number(segment);
  if (page === 1) permanentRedirect(`/${dir}`);
  if (page < 1) notFound();
  return page;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { dir, page } = await params;
  return boardMetadata(decodeURIComponent(dir), pageNumber(page, dir));
}

export default async function DirectoryPageN({ params }: Params) {
  const { dir, page } = await params;
  return <BoardRoute segment={decodeURIComponent(dir)} page={pageNumber(page, dir)} />;
}
