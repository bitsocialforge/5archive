import Link from 'next/link';
import type { ReactNode } from 'react';
import { brandText, brandUrl, siteName } from '@/lib/site';
import archive from '@/styles/archive.module.css';
import blotter from '@/styles/5chan/board-blotter.module.css';
import buttons from '@/styles/5chan/board-buttons.module.css';
import footer from '@/styles/5chan/footer.module.css';
import pagination from '@/styles/5chan/board-pagination.module.css';
import { BoardsBar } from './BoardsBar';

/** 5chan's blotter table, carrying the archive's notes about the page instead of release notes. */
export function Blotter({ rows }: { rows: { key: string; date?: string; text: ReactNode }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={`${blotter.content} ${blotter.show}`}>
      <table className={blotter.blotter}>
        <thead>
          <tr>
            <td>
              <hr />
            </td>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                {row.date ? `${row.date} ` : null}
                {row.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "[label]" in 5chan's desktop button style. */
export const Bracket = ({ href, children }: { href: string; children: ReactNode }) => (
  <>
    [
    <Link className="button" href={href}>
      {children}
    </Link>
    ]
  </>
);

/** 5chan's board search box, scoped to this board's archive. */
export function SearchOps({ board }: { board?: string }) {
  return (
    <form action="/search" method="get" role="search" className={archive.searchForm}>
      <input type="text" name="q" placeholder="Search OPs..." aria-label="Search OPs" className={buttons.searchOPsInput} />
      {board ? <input type="hidden" name="board" value={board} /> : null}
    </form>
  );
}

/** The row of 5chan's DesktopBoardButtons, above the threads; the same buttons on mobile. */
export function BoardButtons({ left, right, mobile }: { left: ReactNode; right?: ReactNode; mobile: ReactNode }) {
  return (
    <>
      <div className={buttons.desktopBoardButtons}>
        <hr />
        {left}
        {right ? <span className={buttons.rightSideButtons}>{right}</span> : null}
      </div>
      <div className={`${buttons.mobileBoardButtons} ${buttons.addMargin}`}>{mobile}</div>
    </>
  );
}

/** Page numbers shown around the current one before the list collapses to "…". */
const PAGE_WINDOW = 4;

function pageList(current: number, total: number): (number | null)[] {
  if (total <= 15) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total]);
  for (let p = current - PAGE_WINDOW; p <= current + PAGE_WINDOW; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const [i, p] of sorted.entries()) {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  }
  return out;
}

/**
 * 5chan's footer pagelist: "Previous [1] [2] … Next | Catalog". Links, not
 * buttons — every page of an archive is a crawlable URL.
 */
export function Pagelist({
  current,
  total,
  href,
  trailing,
}: {
  current: number;
  total: number;
  href: (page: number) => string;
  trailing?: { href: string; label: string }[];
}) {
  return (
    <div className={footer.footerRow}>
      <div className={pagination.pagelist}>
        {current > 1 ? (
          <Link className={pagination.footerPageLink} href={href(current - 1)} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={pagination.footerNavPlainDisabled}>Previous</span>
        )}
        {pageList(current, total).map((page, index) =>
          page === null ? (
            <span key={`gap-${index}`} className={pagination.footerPageBracket}>
              …
            </span>
          ) : (
            <span key={page} className={pagination.footerPageItem}>
              <span className={pagination.footerPageBracket}>[</span>
              <Link
                href={href(page)}
                className={page === current ? pagination.footerPageCurrent : pagination.footerPageLink}
                aria-current={page === current ? 'page' : undefined}
              >
                {page}
              </Link>
              <span className={pagination.footerPageBracket}>]</span>
            </span>
          ),
        )}
        {current < total ? (
          <Link className={pagination.footerPageLink} href={href(current + 1)} rel="next">
            Next
          </Link>
        ) : (
          <span className={pagination.footerNavPlainDisabled}>Next</span>
        )}
        {trailing?.map((link) => (
          <Link key={link.href} href={link.href} className={pagination.pagelistSeparatorLink}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Mobile pagination: 5chan's row of bare page numbers. */
export function MobilePages({ current, total, href }: { current: number; total: number; href: (page: number) => string }) {
  if (total <= 1) return null;
  return (
    <div className={footer.mobileFooterPagination}>
      {pageList(current, total).map((page, index) =>
        page === null ? (
          <span key={`gap-${index}`}>…</span>
        ) : (
          <Link key={page} href={href(page)} className={page === current ? footer.mobileFooterPaginationCurrent : undefined}>
            {page}
          </Link>
        ),
      )}
    </div>
  );
}

/** 5chan's SiteLegalMeta (license-first order), naming the archive. */
export function LegalMeta() {
  return (
    <>
      <span className={archive.licenseText}>
        {siteName} is FOSS under GPL-3.0-or-later. Powered by Bitsocial
        <a className={archive.bitsocialLogoLink} href="https://bitsocial.net" target="_blank" rel="noopener noreferrer" aria-label="Bitsocial">
          {/* eslint-disable-next-line @next/next/no-img-element -- 18px static logo */}
          <img className={archive.bitsocialLogo} src="/assets/logo/bitsocial.png" alt="" width={18} height={18} />
        </a>
      </span>
      <span className={archive.legalLinks}>
        <Link href="/legal">Legal</Link> •{' '}
        <a href="https://github.com/bitsocialforge/5archive" rel="noopener noreferrer">
          Source code
        </a>
        {brandText ? (
          <>
            {' '}
            • {brandUrl ? <a href={brandUrl} rel="noopener noreferrer">{brandText}</a> : brandText}
          </>
        ) : null}
      </span>
    </>
  );
}

/** 5chan's PageFooterDesktop + PageFooterMobile. */
export function PageFooter({ firstRow, mobile }: { firstRow?: ReactNode; mobile?: ReactNode }) {
  return (
    <>
      <footer className={footer.footer}>
        <hr />
        {firstRow ? <div className={footer.firstRow}>{firstRow}</div> : null}
        <div className={footer.boardsBarRow}>
          <BoardsBar desktopOnly />
        </div>
        <div className={footer.legalMeta}>
          <LegalMeta />
        </div>
      </footer>
      <footer className={footer.mobileFooter}>
        <hr />
        {mobile}
        <hr />
        <div className={footer.mobileFooterLinks}>
          <LegalMeta />
        </div>
      </footer>
    </>
  );
}

