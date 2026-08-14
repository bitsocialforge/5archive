import { notFound, permanentRedirect } from 'next/navigation';
import { getThread } from '@/lib/api';
import { threadPath } from '@/lib/directories';

// Legacy URL: threads moved from /c/<cid> to /<dir>/thread/<cid>. Kept as a
// permanent redirect so indexed links and old bookmarks live. A reply cid lands
// on its thread, anchored at the reply.
export const revalidate = 300;

type Params = { params: Promise<{ cid: string }> };

export default async function LegacyThreadPage({ params }: Params) {
  const { cid } = await params;
  const thread = await getThread(decodeURIComponent(cid));

  if (!thread) notFound();
  permanentRedirect(threadPath(thread.post));
}
