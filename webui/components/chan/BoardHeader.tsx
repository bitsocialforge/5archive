import Link from 'next/link';
import type { ReactNode } from 'react';
import { siteName } from '@/lib/site';
import archive from '@/styles/archive.module.css';
import styles from '@/styles/5chan/board-header.module.css';

/**
 * 5chan's BoardHeader. The archive's logo stands in the banner slot (as
 * 4archive's does over 4chan's), and the title is the page's h1: the board
 * name on a board, the thread's headline on a thread.
 */
export function BoardHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className={styles.content}>
      <div className={`${styles.bannerCnt} ${archive.banner}`}>
        <Link href="/" className={archive.bannerLink} aria-label={`${siteName} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static logo */}
          <img src="/assets/logo/logo-transparent.png" alt="" width={284} height={100} />
        </Link>
      </div>
      <h1 className={`${styles.boardTitle} ${archive.title}`}>{title}</h1>
      {subtitle ? <div className={`${styles.boardSubtitle} ${archive.subtitle}`}>{subtitle}</div> : null}
      <hr />
    </div>
  );
}
