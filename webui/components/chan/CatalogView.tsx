import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ApiDown } from '@/components/Notice';
import { UpstreamBoardForm } from '@/components/Upstream';
import { threadPath } from '@/lib/directories';
import { excerpt } from '@/lib/format';
import { postView, thumbnailSize, type PostView } from '@/lib/post';
import type { Theme } from '@/lib/theme';
import type { Comment } from '@/lib/types';
import archive from '@/styles/archive.module.css';
import styles from '@/styles/5chan/catalog-row.module.css';
import { BoardHeader } from './BoardHeader';
import { BoardsBar } from './BoardsBar';
import { BoardButtons, Bracket, MobilePages, PageFooter, Pagelist } from './Chrome';
import footerStyles from '@/styles/5chan/footer.module.css';
import { ThemeRoot } from './ThemeRoot';

/** 5chan's catalog thumbnails are 150px ("Small", the default). */
const CATALOG_THUMBNAIL = 150;

/** The catalog thumbnail: image, a video's first frame, or the spoiler card. */
function CatalogThumb({ view }: { view: PostView }) {
  const media = view.media;
  const size = media && !view.spoiler ? thumbnailSize(media, CATALOG_THUMBNAIL) : null;
  const style = size ? ({ '--width': `${size.width}px`, '--height': `${size.height}px` } as CSSProperties) : undefined;
  return (
    <span className={styles.mediaWrapper} style={style}>
      {!view.spoiler && media?.type === 'video' && !media.thumbnail ? (
        <video src={media.url} preload="metadata" muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- third-party media, sized by CSS
        <img src={view.spoiler ? '/assets/spoiler.png' : media?.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
      )}
    </span>
  );
}

function Teaser({ view }: { view: PostView }) {
  const { comment } = view;
  if (view.tombstone) {
    return (
      <div className={styles.teaser}>
        <b>{comment.removed || comment.takedown ? '(removed)' : '(deleted)'}</b>
      </div>
    );
  }
  const title = comment.title?.trim();
  return (
    <div className={styles.teaser}>
      {title ? (
        <span>
          <b>{title}</b>
          {comment.content ? ': ' : ''}
        </span>
      ) : null}
      {excerpt(comment.content, 300)}
    </div>
  );
}

/** 5chan's CatalogPost, with the OP comment shown (5chan's default). */
function CatalogPost({ post }: { post: Comment }) {
  const view = postView(post);
  const href = threadPath(post);
  const hasThumbnail = !view.tombstone && (view.spoiler || Boolean(view.media?.thumbnail) || view.media?.type === 'video');
  const icons = (
    <div className={styles.threadIcons}>
      {view.pinned ? <span className={styles.stickyIcon} title="Sticky" /> : null}
      {view.locked ? <span className={styles.closedIcon} title="Closed" /> : null}
      {post.archived ? <span className={styles.archivedIcon} title="Archived" /> : null}
    </div>
  );

  return (
    <div className={styles.post} style={{ '--maxWidth': `${CATALOG_THUMBNAIL}px`, '--maxHeight': `${CATALOG_THUMBNAIL}px` } as CSSProperties} data-thread={post.cid}>
      <div>
        {hasThumbnail ? (
          <Link href={href}>
            <div className={styles.mediaPaddingWrapper}>
              {icons}
              <CatalogThumb view={view} />
            </div>
          </Link>
        ) : (
          icons
        )}
        <div className={styles.meta} title="(R)eplies">
          R: <b>{post.reply_count}</b>
        </div>
        <div className={styles.postContent}>
          {hasThumbnail ? (
            <Teaser view={view} />
          ) : (
            <Link href={href}>
              <Teaser view={view} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export interface CatalogViewProps {
  theme: Theme;
  code?: string;
  /** Set on a single board's catalog inside a shared code. */
  board?: string;
  /** The board (or /all) the catalog belongs to; the catalog is `${boardHref}/catalog`. */
  boardHref: string;
  title: string;
  subtitle?: ReactNode;
  posts: Comment[] | null;
  page: number;
  totalPages: number;
}

export function CatalogView({ theme, code, board, boardHref, title, subtitle, posts, page, totalPages }: CatalogViewProps) {
  const catalogHref = `${boardHref}/catalog`;
  const pageHref = (n: number) => (n === 1 ? catalogHref : `${catalogHref}?page=${n}`);

  return (
    <ThemeRoot theme={theme}>
      <span id="top" />
      <BoardsBar current={code ?? 'all'} />
      <BoardHeader title={title} subtitle={subtitle} />
      {code ? <UpstreamBoardForm code={code} board={board} /> : null}
      <BoardButtons
        left={
          <>
            <Bracket href={boardHref}>Return</Bracket> <Bracket href="#bottom">Bottom</Bracket>
          </>
        }
        mobile={
          <>
            <Link className="button" href={boardHref}>
              Return
            </Link>{' '}
            <Link className="button" href="#bottom">
              Bottom
            </Link>
          </>
        }
      />
      <hr />
      {posts === null ? (
        <ApiDown />
      ) : posts.length === 0 ? (
        <div className={archive.notice}>No threads archived on this board yet.</div>
      ) : (
        <div className={`${styles.row} ${archive.catalogGrid}`}>
          {posts.map((post) => (
            <CatalogPost key={post.cid} post={post} />
          ))}
        </div>
      )}
      <span id="bottom" />
      <PageFooter
        firstRow={
          totalPages > 1 ? <Pagelist current={page} total={totalPages} href={pageHref} trailing={[{ href: boardHref, label: 'Return' }]} /> : null
        }
        mobile={
          <>
            <div className={footerStyles.mobileFooterButtons}>
              <Link className="button" href={boardHref}>
                Return
              </Link>{' '}
              <Link className="button" href="#top">
                Top
              </Link>
            </div>
            <MobilePages current={page} total={totalPages} href={pageHref} />
          </>
        }
      />
    </ThemeRoot>
  );
}
