import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalMeta } from '@/components/chan/Chrome';
import { ThemeRoot } from '@/components/chan/ThemeRoot';
import { JsonLd } from '@/components/JsonLd';
import { ApiDown } from '@/components/Notice';
import { UpstreamIntro } from '@/components/Upstream';
import { getCommunities, getHealth, getPosts } from '@/lib/api';
import { boardName, directoryForName, HOME_COLUMNS } from '@/lib/boards';
import { adHocDirectory, directoryForAddress, threadPath } from '@/lib/directories';
import { excerpt } from '@/lib/format';
import { siteGraph } from '@/lib/jsonld';
import { postView } from '@/lib/post';
import { siteDescription, siteName, upstreamName, upstreamUrl } from '@/lib/site';
import { multiboardTheme } from '@/lib/theme';
import { hasUpstream } from '@/lib/upstream';
import type { Comment, Community } from '@/lib/types';
import homeFooter from '@/styles/5chan/home-footer.module.css';
import logo from '@/styles/5chan/home-logo.module.css';
import styles from '@/styles/5chan/home.module.css';
import archive from '@/styles/archive.module.css';

// Render at request time (never bake an "API down" page into the build); the
// fetches themselves are cached in the data cache (see lib/api.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

/** 5chan's Popular Threads box shows eight worksafe threads. */
const POPULAR_THREADS = 8;

/**
 * Worksafe threads only, like 5chan's default; the busiest of the past week
 * first, topped up with the newest when the week was quiet. Threads with media
 * lead, since the box is a wall of thumbnails.
 */
async function popularThreads(communities: Community[]): Promise<Comment[]> {
  const nsfw = new Set(communities.filter((c) => c.nsfw === 1).map((c) => c.address));
  const [week, recent] = await Promise.all([
    getPosts('?sort=replies&time=week&limit=50'),
    getPosts('?sort=new&limit=50'),
  ]);
  const seen = new Set<string>();
  const pool = [...(week?.posts ?? []), ...(recent?.posts ?? [])].filter((post) => {
    if (nsfw.has(post.community_address) || post.nsfw === 1 || seen.has(post.cid)) return false;
    seen.add(post.cid);
    return !(post.removed || post.deleted || post.takedown);
  });
  const withMedia = new Set(pool.filter((post) => postView(post).media?.thumbnail));
  return [...withMedia, ...pool.filter((post) => !withMedia.has(post))].slice(0, POPULAR_THREADS);
}

const NsfwBadge = () => (
  <>
    &nbsp;
    <h3 className={styles.nsfwBadge}>
      <span title="Not Safe For Work">
        <sup>(NSFW)</sup>
      </span>
    </h3>
  </>
);

function BoardLink({ name }: { name: string }) {
  const dir = directoryForName(name);
  return (
    <li>
      {dir ? (
        <Link href={`/${encodeURIComponent(dir.code)}`}>{name}</Link>
      ) : (
        // 5chan's placeholder: a board with no archive behind it, greyed out.
        <span className={archive.placeholder} title="Nothing archived from this board">
          {name}
        </span>
      )}
    </li>
  );
}

/** 5chan's Boards box, column for column; boards it doesn't list go under "Unlisted". */
function BoardsBox({ communities }: { communities: Community[] }) {
  const listed = new Set(HOME_COLUMNS.flat().flatMap((category) => category.boards));
  const unlisted = new Map<string, string>();
  for (const community of communities) {
    const dir = directoryForAddress(community.address) ?? adHocDirectory(community);
    if (!listed.has(boardName(dir.title))) unlisted.set(dir.code, boardName(dir.title));
  }

  return (
    <div className={styles.box}>
      <div className={styles.boxBar}>
        <h2 className="capitalize">Boards</h2>
      </div>
      <div className={`${styles.boxContent} ${styles.boardsContent}`}>
        {HOME_COLUMNS.map((column) => (
          <div key={column[0].title} className={styles.boardsColumn}>
            {column.map((category) => (
              <div key={category.title}>
                <h3>{category.title}</h3>
                {category.nsfw ? <NsfwBadge /> : null}
                <ul>
                  {category.boards.map((name) => (
                    <BoardLink key={name} name={name} />
                  ))}
                </ul>
              </div>
            ))}
            {column === HOME_COLUMNS[HOME_COLUMNS.length - 1] ? (
              <>
                <h3>Multiboards</h3>
                <NsfwBadge />
                <ul>
                  <li>
                    <Link href="/all">All Archived Boards</Link>
                  </li>
                  <li>
                    <Link href="/search">Archive Search</Link>
                  </li>
                </ul>
                {unlisted.size > 0 ? (
                  <>
                    <h3>Unlisted</h3>
                    <ul>
                      {[...unlisted].map(([code, name]) => (
                        <li key={code}>
                          <Link href={`/${encodeURIComponent(code)}`}>{name}</Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PopularThread({ post }: { post: Comment }) {
  const view = postView(post);
  const dir = directoryForAddress(post.community_address);
  const thumbnail = view.spoiler ? '/assets/spoiler.png' : view.media?.thumbnail;
  const title = post.title?.trim();
  return (
    <div className={styles.popularThread} data-popular-thread={post.cid}>
      <div className={styles.title}>{dir ? boardName(dir.title) : post.community_address}</div>
      {thumbnail ? (
        <div className={styles.mediaContainer}>
          <Link href={threadPath(post)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- third-party media, sized by CSS */}
            <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </Link>
        </div>
      ) : null}
      <div className={styles.threadContent}>
        <Link href={threadPath(post)}>
          {title ? (
            <>
              <b>{title}</b>
              {post.content ? ': ' : null}
            </>
          ) : null}
          {excerpt(post.content, 99)}
        </Link>
      </div>
    </div>
  );
}

export default async function Home() {
  const [health, communitiesRes] = await Promise.all([getHealth(), getCommunities()]);
  const communities = communitiesRes?.communities ?? [];
  const popular = health ? await popularThreads(communities) : [];

  return (
    <ThemeRoot theme={multiboardTheme}>
      <JsonLd graph={siteGraph(siteDescription)} />
      <div className={styles.content}>
        <Link href="/" aria-label={`${siteName} home`}>
          <div className={logo.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
            <img alt="" src="/assets/logo/logo-transparent.png" width={341} height={120} />
          </div>
        </Link>
        <div className={styles.searchBar}>
          <form action="/search" method="get" role="search">
            <input type="text" name="q" aria-label="Search archived posts" placeholder="Search archived posts" autoComplete="off" />
            <button type="submit" className={styles.searchButton}>
              Go
            </button>
          </form>
        </div>

        <div className={`${styles.box} ${styles.infoBox}`}>
          <div className={styles.infoboxBar}>
            <h1 className={archive.boxHeading}>What is {siteName}?</h1>
          </div>
          <div className={styles.boxContent}>
            <UpstreamIntro />
          </div>
        </div>

        {!health ? (
          <ApiDown />
        ) : (
          <>
            <BoardsBox communities={communities} />

            <div className={styles.box}>
              <div className={styles.boxBar}>
                <h2 className="capitalize">Popular threads</h2>
              </div>
              <div className={`${styles.boxContent} ${styles.popularThreads}`}>
                {popular.length > 0 ? popular.map((post) => <PopularThread key={post.cid} post={post} />) : 'Nothing has been archived yet.'}
              </div>
            </div>

            <div className={styles.box}>
              <div className={styles.boxBar}>
                <h2 className={styles.statsTitle}>Stats</h2>
              </div>
              <div className={`${styles.boxContent} ${styles.stats}`}>
                <div className={styles.stat}>
                  <b>Total Posts:</b> {health.posts + health.replies}
                </div>
                <div className={styles.stat}>
                  <b>Threads:</b> {health.posts}
                </div>
                <div className={styles.stat}>
                  <b>Boards:</b> {health.communities}
                </div>
              </div>
            </div>
          </>
        )}

        <ul className={homeFooter.footer}>
          <li>
            <Link href="/">Home</Link>
          </li>
          {hasUpstream ? (
            <li>
              <a href={upstreamUrl}>{upstreamName}</a>
            </li>
          ) : null}
          <li>
            <Link href="/all">All Boards</Link>
          </li>
          <li>
            <Link href="/search">Search</Link>
          </li>
          <li>
            <Link href="/legal">Legal</Link>
          </li>
          <li>
            <a href="https://github.com/bitsocialforge/5archive" rel="noopener noreferrer">
              Source Code
            </a>
          </li>
        </ul>
        <div className={homeFooter.footerInfo}>
          <LegalMeta />
        </div>
      </div>
    </ThemeRoot>
  );
}
