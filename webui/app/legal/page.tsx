import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { BoardHeader } from '@/components/chan/BoardHeader';
import { BoardsBar } from '@/components/chan/BoardsBar';
import { PageFooter } from '@/components/chan/Chrome';
import { ThemeRoot } from '@/components/chan/ThemeRoot';
import { brandText, brandUrl, contactEmail, siteName, siteTitle } from '@/lib/site';
import { multiboardTheme } from '@/lib/theme';
import archive from '@/styles/archive.module.css';
import home from '@/styles/5chan/home.module.css';

// Render at request time so the operator's env (CONTACT_EMAIL, branding) is
// read live instead of being baked into the build — same as the home page.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: `Legal · ${siteTitle}` },
  description: 'Archive policy and content-removal contact for this instance.',
  alternates: { canonical: '/legal' },
  openGraph: { url: '/legal' },
};

/** One section, boxed like 5chan's home and rules boxes. */
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className={home.box}>
    <div className={home.boxBar}>
      <h2>{title}</h2>
    </div>
    <div className={home.boxContent}>{children}</div>
  </section>
);

export default function LegalPage() {
  return (
    <ThemeRoot theme={multiboardTheme}>
      <BoardsBar />
      <BoardHeader title="Legal" subtitle="Archive policy for this instance." />
      <article className={archive.page}>
        <Section title="What this site is">
          <p>
            {siteName} is an independent public archive and search index of publicly published
            communities on the Bitsocial network. It stores searchable copies of public posts and
            serves them even after they are no longer live on the network.
            {brandText ? (
              <>
                {' '}This instance is operated by{' '}
                {brandUrl ? <a href={brandUrl} rel="noopener noreferrer">{brandText}</a> : brandText}.
              </>
            ) : null}
          </p>
        </Section>

        <Section title="Content policy">
          <p>
            Only public communities explicitly configured by the operator of this instance are
            indexed, and those communities are already moderated on the Bitsocial network — content
            pending moderator approval is never indexed here. When a moderator removes a post or its
            author deletes it, the archived copy is redacted: the content is no longer served, and a
            placeholder tombstone is kept in its place so thread structure stays intact.
          </p>
        </Section>

        <Section title="Content removal / takedown requests">
          {contactEmail ? (
            <p>
              To request the removal of content from this archive — for example a copyright (DMCA)
              claim, illegal content, or personal information — email{' '}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with the page URLs (and/or the
              CIDs) of the content in question and the reason for the request. Honored requests are
              redacted from serving and shown as tombstones marked as removed by takedown request.
            </p>
          ) : (
            <p>
              Content-removal requests — for example a copyright (DMCA) claim, illegal content, or
              personal information — are handled by the operator of this instance. Honored requests
              are redacted from serving and shown as tombstones marked as removed by takedown
              request.
            </p>
          )}
        </Section>

        <Section title="Media">
          <p>
            This site does not host or serve media. Archived posts are text; any images or video
            that appear are embedded from third-party hosts. Requests about a media file itself
            should be directed to the host serving it.
          </p>
        </Section>
      </article>
      <PageFooter />
    </ThemeRoot>
  );
}
