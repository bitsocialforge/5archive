import { isTombstone, tombstoneText } from '@/components/Tombstone';
import { boardPath, replyAnchor, threadPath } from './directories';
import { absUrl, siteName, siteUrl } from './site';
import type { Comment, Thread } from './types';

/**
 * Structured data for the archive's indexable pages.
 *
 * These pages are the only crawlable rendering of 5chan's threads, so it's
 * worth telling search engines what they are: read as a DiscussionForumPosting,
 * a thread is eligible for forum rich results and the Forums filter, neither of
 * which a generic page can appear in. It is also the clearest machine-readable
 * claim that this is an archive of a named source rather than scraped content.
 *
 * One rule governs everything below: the markup may only describe what the page
 * actually renders. Every field is therefore built from the same expression the
 * JSX uses, never a parallel one that could drift.
 */

interface Person {
  '@type': 'Person';
  name: string;
}

interface CommentNode {
  '@type': 'Comment';
  '@id': string;
  url: string;
  text: string;
  datePublished: string;
  author: Person;
  /** Redacted replies: schema.org's slot for "gone, but kept for threading". */
  creativeWorkStatus?: 'Deleted';
}

interface ForumPosting {
  '@type': 'DiscussionForumPosting';
  '@id': string;
  url: string;
  mainEntityOfPage: string;
  headline: string;
  text: string;
  datePublished: string;
  author: Person;
  isPartOf: { '@type': 'CreativeWork'; name: string; url: string };
  sharedContent?: { '@type': 'WebPage'; url: string };
  commentCount: number;
  comment: CommentNode[];
}

interface ListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item?: string;
}

interface Breadcrumb {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem[];
}

interface CollectionPage {
  '@type': 'CollectionPage';
  '@id': string;
  url: string;
  name: string;
  description: string;
  isPartOf: { '@type': 'WebSite'; '@id': string };
}

interface WebSite {
  '@type': 'WebSite';
  '@id': string;
  url: string;
  name: string;
  description: string;
  potentialAction: {
    '@type': 'SearchAction';
    target: { '@type': 'EntryPoint'; urlTemplate: string };
    'query-input': 'required name=search_term_string';
  };
}

type Node = ForumPosting | Breadcrumb | CollectionPage | WebSite;

export interface Graph {
  '@context': 'https://schema.org';
  '@graph': Node[];
}

const graph = (nodes: Node[]): Graph => ({ '@context': 'https://schema.org', '@graph': nodes });

/** Stable id for the site entity, so other pages can point at it. */
const websiteId = `${siteUrl}/#website`;

/** The same expression the rendered <time dateTime> uses. */
const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

/** The byline the page prints, verbatim — not normalised to "Anonymous". */
const author = (post: Comment): Person => ({ '@type': 'Person', name: post.author_name ?? 'anon' });

const crumbs = (items: { name: string; path?: string }[]): Breadcrumb => ({
  '@type': 'BreadcrumbList',
  // The last crumb is the current page and carries no item, per Google.
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    ...(item.path ? { item: absUrl(item.path) } : {}),
  })),
});

/**
 * Replies, flat and in render order — the page renders them flat, so nesting
 * them by parent_cid here would describe a shape the reader never sees.
 * Tombstones stay in, quoting their visible placeholder: dropping them would
 * silently renumber the thread. A reply with no text at all (and no redaction
 * to explain it) has nothing to quote and is left out.
 */
function commentNodes(replies: Comment[], canonical: string): CommentNode[] {
  const nodes: CommentNode[] = [];

  for (const reply of replies) {
    const redacted = isTombstone(reply);
    const text = redacted ? tombstoneText(reply) : reply.content;
    if (!text) continue;

    const url = `${canonical}#${replyAnchor(reply.cid)}`;
    nodes.push({
      '@type': 'Comment',
      '@id': url,
      url,
      text,
      datePublished: iso(reply.timestamp),
      author: author(reply),
      ...(redacted ? { creativeWorkStatus: 'Deleted' as const } : {}),
    });
  }

  return nodes;
}

/**
 * A thread. Null when there's nothing honest to describe — a redacted OP (that
 * page is noindexed anyway) or an OP with no text at all, which can't satisfy
 * the type's text requirement without inventing something.
 *
 * `headline` must be the string the page renders as its <h1>, and the URLs are
 * the ROOT thread's even on a reply permalink, matching the canonical: every
 * variant of a thread describes the same thread.
 */
export function threadGraph(thread: Thread, headline: string, code: string): Graph | null {
  const { post, replies } = thread;
  if (isTombstone(post)) return null;

  const text = post.content ?? post.title;
  if (!text) return null;

  const canonical = absUrl(threadPath(post));
  const board = `/${code}/`;

  const posting: ForumPosting = {
    '@type': 'DiscussionForumPosting',
    '@id': canonical,
    url: canonical,
    mainEntityOfPage: canonical,
    headline,
    text,
    datePublished: iso(post.timestamp),
    author: author(post),
    // The board on this archive — never upstream. Pointing this at 5chan to
    // sneak in a funnel link would describe a page this one isn't part of.
    isPartOf: { '@type': 'CreativeWork', name: board, url: absUrl(boardPath(post.community_address)) },
    ...(post.link ? { sharedContent: { '@type': 'WebPage' as const, url: post.link } } : {}),
    // What the page's own <h2> counts, including replies omitted above.
    commentCount: replies.length,
    comment: commentNodes(replies, canonical),
  };

  return graph([
    crumbs([{ name: siteName, path: '/' }, { name: board, path: boardPath(post.community_address) }, { name: headline }]),
    posting,
  ]);
}

/** A directory page: a listing, described with the description it already shows. */
export function boardGraph(code: string, title: string, description: string): Graph {
  const url = absUrl(`/${encodeURIComponent(code)}`);

  return graph([
    crumbs([{ name: siteName, path: '/' }, { name: title }]),
    {
      '@type': 'CollectionPage',
      '@id': url,
      url,
      name: title,
      description,
      isPartOf: { '@type': 'WebSite', '@id': websiteId },
    },
  ]);
}

/**
 * The site entity, and the anchor every board page's isPartOf refers to.
 * The SearchAction no longer earns a Google feature — the sitelinks search box
 * was retired in 2024 — but other engines and crawlers still read it, and it is
 * how anything machine-readable discovers the archive is searchable at all.
 */
export function siteGraph(description: string): Graph {
  return graph([
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${siteUrl}/`,
      name: siteName,
      description,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ]);
}
