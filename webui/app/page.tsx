import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ApiDown } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';
import { getCommunities, getHealth, getPosts } from '@/lib/api';
import { adHocDirectory, directoryForAddress } from '@/lib/directories';
import type { Community } from '@/lib/types';

// Render at request time (never bake an "API down" page into the build); the
// fetches themselves are cached in the data cache (see lib/api.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

/**
 * Boards indexed under each directory code, collapsed into one entry per code
 * (several boards can hold the same code — see lib/directories), busiest first.
 */
function directoryIndex(communities: Community[]) {
  const entries = new Map<string, { code: string; title: string; threads: number }>();
  for (const community of communities) {
    const dir = directoryForAddress(community.address) ?? adHocDirectory(community);
    const entry = entries.get(dir.code) ?? { code: dir.code, title: dir.title, threads: 0 };
    entry.threads += community.post_count;
    entries.set(dir.code, entry);
  }
  return [...entries.values()].sort((a, b) => b.threads - a.threads || a.code.localeCompare(b.code));
}

export default async function Home() {
  const [health, communitiesRes] = await Promise.all([getHealth(), getCommunities()]);

  if (!health) return <ApiDown />;

  const communities = communitiesRes?.communities ?? [];
  if (communities.length === 0) return <EmptyState />;

  const posts = (await getPosts('?sort=new&limit=25'))?.posts ?? [];
  const boards = directoryIndex(communities);

  return (
    <div className="layout">
      <section>
        <h2 className="section-title">Recent across {boards.length} boards</h2>
        {posts.length === 0 ? (
          <div className="notice">Communities are configured, but nothing has been indexed yet.</div>
        ) : (
          posts.map((p) => <PostCard key={p.cid} post={p} />)
        )}
      </section>

      <aside className="sidebar">
        <h2 className="section-title">Boards</h2>
        <ul className="community-list">
          {boards.map((board) => (
            <li key={board.code}>
              <Link href={`/${encodeURIComponent(board.code)}`}>
                <span>{board.title}</span>
                <span className="count">{board.threads}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
