import { notFound, permanentRedirect } from 'next/navigation';
import { getCommunity } from '@/lib/api';
import { boardPath, directoryForAddress } from '@/lib/directories';

// Legacy URL: boards moved from /p/<address> to their 5chan directory code
// (/biz). Kept as a permanent redirect so indexed links and old bookmarks live.
export const revalidate = 5;

type Params = { params: Promise<{ community: string }> };

export default async function LegacyCommunityPage({ params }: Params) {
  const { community } = await params;
  const address = decodeURIComponent(community);

  // A board with no directory code keeps its address as the URL segment, but
  // only if it is actually indexed — otherwise the segment resolves to nothing.
  if (!directoryForAddress(address) && !(await getCommunity(address))) notFound();
  permanentRedirect(boardPath(address));
}
