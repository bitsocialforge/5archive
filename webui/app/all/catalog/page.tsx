import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogView } from '@/components/chan/CatalogView';
import { getPosts } from '@/lib/api';
import { multiboardTheme } from '@/lib/theme';

export const revalidate = 5;

const CATALOG_PER_PAGE = 100;

type Props = { searchParams: Promise<{ page?: string }> };

export const metadata: Metadata = {
  title: '/all/ - Catalog',
  alternates: { canonical: '/all/catalog' },
  robots: { index: false, follow: true },
};

export default async function AllCatalogPage({ searchParams }: Props) {
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? '1', 10) || 1);
  const listing = await getPosts(`?sort=new&limit=${CATALOG_PER_PAGE}&page=${page}`);
  if (listing && page > 1 && listing.posts.length === 0) notFound();

  return (
    <CatalogView
      theme={multiboardTheme}
      boardHref="/all"
      title="/all/ - All Archived Boards"
      subtitle="Catalog"
      posts={listing?.posts ?? null}
      page={page}
      totalPages={listing ? Math.max(1, Math.ceil(listing.total / CATALOG_PER_PAGE)) : 0}
    />
  );
}
