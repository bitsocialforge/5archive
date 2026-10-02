import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogView } from '@/components/chan/CatalogView';
import { resolveBoard, scopeListing, scopePath } from '@/lib/board-route';
import { boardTheme } from '@/lib/theme';

export const revalidate = 5;

/** 5chan's catalog shows a board's threads at a glance; a page holds the API's maximum. */
const CATALOG_PER_PAGE = 100;

type Props = { params: Promise<{ dir: string }>; searchParams: Promise<{ page?: string }> };

const pageOf = (value: string | undefined) => Math.max(1, Number.parseInt(value ?? '1', 10) || 1);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const scope = await resolveBoard(decodeURIComponent((await params).dir), '/catalog');
  return {
    title: `${scope.board ?? scope.dir.title} - Catalog`,
    alternates: { canonical: `${scopePath(scope)}/catalog` },
    // The same threads as the board pages, as thumbnails: not worth a second index entry.
    robots: { index: false, follow: true },
  };
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const scope = await resolveBoard(decodeURIComponent((await params).dir), '/catalog');
  const page = pageOf((await searchParams).page);
  const { indexed, listing } = await scopeListing(scope, page, CATALOG_PER_PAGE);
  if (listing && page > 1 && listing.posts.length === 0) notFound();

  return (
    <CatalogView
      theme={boardTheme(indexed)}
      code={scope.dir.code}
      board={scope.board}
      boardHref={scopePath(scope)}
      title={scope.board ?? scope.dir.title}
      subtitle="Catalog"
      posts={listing?.posts ?? null}
      page={page}
      totalPages={listing ? Math.max(1, Math.ceil(listing.total / CATALOG_PER_PAGE)) : 0}
    />
  );
}
