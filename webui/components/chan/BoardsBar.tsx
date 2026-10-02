import { archivedCodes, boardBarGroups } from '@/lib/boards';
import { directories } from '@/lib/directories';
import { upstreamName, upstreamUrl } from '@/lib/site';
import { hasUpstream } from '@/lib/upstream';
import styles from '@/styles/5chan/boards-bar.module.css';
import { BoardSelect } from './BoardSelect';

/**
 * 5chan's BoardsBar: the bracketed board list on desktop, a board <select> on
 * mobile. Codes this archive holds nothing for render as 5chan's placeholders.
 * Where 5chan links Settings, the archive links back to the live network.
 * The footer repeats only the desktop bar; the mobile one is fixed to the top.
 *
 * Plain anchors, not next/link: the bar is ~90 links rendered twice per page,
 * and Link would hydrate and prefetch every one of them on every page view.
 */
export function BoardsBar({ current, desktopOnly = false }: { current?: string; desktopOnly?: boolean }) {
  const groups = boardBarGroups();

  return (
    <>
      <div className={styles.boardNavDesktop}>
        <span className={styles.boardList}>
          [<a href="/all">all</a> / <a href="/search">search</a>]{' '}
          {groups.map((group) => (
            <span key={group.join('|')}>
              [
              {group.map((code, index) => (
                <span key={code}>
                  {archivedCodes.has(code) ? (
                    <a href={`/${encodeURIComponent(code)}`}>{code}</a>
                  ) : (
                    <span className={styles.placeholder} title="Not archived">
                      {code}
                    </span>
                  )}
                  {index !== group.length - 1 && ' / '}
                </span>
              ))}
              ]{' '}
            </span>
          ))}
        </span>
        <span className={styles.navTopRight}>
          {hasUpstream ? (
            <>
              [<a href={upstreamUrl} title={`${upstreamName} — the live network this archive mirrors`}>{upstreamName}</a>]{' '}
            </>
          ) : null}
          [<a href="/search">Search</a>] [<a href="/">Home</a>]
        </span>
      </div>
      {desktopOnly ? null : (
      <div className={styles.boardNavMobile}>
        <div className={styles.boardSelect}>
          <strong>Board</strong>
          <BoardSelect
            current={current}
            options={[
              { value: 'all', label: '/all/ - All Archived Boards' },
              { value: 'search', label: '/search/ - Archive Search' },
              ...directories.map((d) => ({ value: d.code, label: d.title })),
            ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))}
          />
        </div>
        <div className={styles.pageJump}>
          {hasUpstream ? <a href={upstreamUrl}>{upstreamName}</a> : null}
          <a href="/search">Search</a>
          <a href="/">Home</a>
        </div>
      </div>
      )}
    </>
  );
}
