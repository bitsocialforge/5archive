import type { Metadata } from 'next';
import { boardMetadata } from '@/lib/board-route';
import { BoardRoute } from './board';

// Cache the rendered page; identical fetches are deduped with generateMetadata.
export const revalidate = 5;

type Params = { params: Promise<{ dir: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { dir } = await params;
  return boardMetadata(decodeURIComponent(dir), 1);
}

export default async function DirectoryPage({ params }: Params) {
  const { dir } = await params;
  return <BoardRoute segment={decodeURIComponent(dir)} page={1} />;
}
