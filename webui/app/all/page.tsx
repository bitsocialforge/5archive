import type { Metadata } from 'next';
import { AllRoute } from './all';

export const revalidate = 5;

export const metadata: Metadata = {
  title: '/all/ - All Archived Boards',
  description: 'The newest archived threads across every 5chan board.',
  alternates: { canonical: '/all' },
};

export default function AllPage() {
  return <AllRoute page={1} />;
}
