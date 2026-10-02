import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { AllRoute } from '../all';

export const revalidate = 5;

type Params = { params: Promise<{ page: string }> };

function pageNumber(segment: string): number {
  if (!/^\d+$/.test(segment)) notFound();
  const page = Number(segment);
  if (page === 1) permanentRedirect('/all');
  if (page < 1) notFound();
  return page;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = pageNumber((await params).page);
  return { title: `/all/ - All Archived Boards - Page ${page}`, alternates: { canonical: `/all/${page}` } };
}

export default async function AllPageN({ params }: Params) {
  return <AllRoute page={pageNumber((await params).page)} />;
}
