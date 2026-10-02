import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { archivedCodes } from '@/lib/boards';
import type { ResolveQuote } from '@/lib/thread';
import md from '@/styles/5chan/markdown.module.css';
import post from '@/styles/5chan/post.module.css';

/**
 * Server-side port of 5chan's Markdown component (src/components/markdown):
 * the same tokens — [spoiler], [text](url), >>>/board/ links, >>N quotelinks,
 * bare URLs — the same line-wise greentext, and the same markup and classes.
 * The source text is never interpreted as HTML.
 */

type Token =
  | { type: 'text'; value: string }
  | { type: 'markdownLink'; text: string; href: string }
  | { type: 'url'; href: string }
  | { type: 'quoteLink'; number: number }
  | { type: 'crossBoardLink'; display: string; route: string | null }
  | { type: 'spoiler'; tokens: Token[] };

const SPOILER = /\[[sS][pP][oO][iI][lL][eE][rR]\]([\s\S]*?)\[\/[sS][pP][oO][iI][lL][eE][rR]\]/;
const MARKDOWN_LINK = /(?<!!)\[([^\]\n]+)\]\(\s*([^\n)]*?)\s*\)/;
const CROSSBOARD = />>>\/((?:[a-zA-Z0-9]{1,10}\/(?:[a-zA-Z0-9]{46}|[a-zA-Z0-9_-]+)?|[a-zA-Z0-9\-.]+(?:\/(?:[a-zA-Z0-9]{46}|[a-zA-Z0-9_-]+))?))[.,:;!?]*/;
const QUOTE_LINK = /(?<![>/\w])>>(\d+)(?![\d/])/;
const URL_PATTERN = /https?:\/\/[^\s<>[\]]+/;

const COMBINED = new RegExp(
  `(${SPOILER.source})|(${MARKDOWN_LINK.source})|(${CROSSBOARD.source})|(${QUOTE_LINK.source})|(${URL_PATTERN.source})`,
  'g',
);
const COMBINED_WITHOUT_SPOILER = new RegExp(
  `(${MARKDOWN_LINK.source})|(${CROSSBOARD.source})|(${QUOTE_LINK.source})|(${URL_PATTERN.source})`,
  'g',
);

const normalizeContent = (content: string) =>
  content.replace(/\n&nbsp;\n/g, '\n\n').replace(/\n{3,}/g, '\n\n');

const isGreentextLine = (line: string) => {
  if (line === '>') return true;
  if (!/^>+[^>]/.test(line)) return false;
  return !/^>>\d/.test(line) && !line.startsWith('>>>/');
};

/** Trailing punctuation and unbalanced ")" belong to the sentence, not the URL. */
function splitUrlTrailingText(raw: string): { href: string; trailing: string } {
  let href = raw;
  let trailing = '';
  while (href) {
    const punctuation = href.match(/[.,;:!?"']+$/);
    if (punctuation) {
      trailing = `${punctuation[0]}${trailing}`;
      href = href.slice(0, -punctuation[0].length);
      continue;
    }
    if (href.endsWith(')') && (href.match(/\)/g) ?? []).length > (href.match(/\(/g) ?? []).length) {
      trailing = `)${trailing}`;
      href = href.slice(0, -1);
      continue;
    }
    break;
  }
  return { href, trailing };
}

/** >>>/g/ → /g ; >>>/g/<cid> → /g/thread/<cid> ; >>>/g/text → board search. */
function crossBoardRoute(pattern: string): string | null {
  const path = pattern.replace(/^>>>\//, '').replace(/[.,:;!?]+$/, '');
  const [board, rest] = path.split('/');
  if (!board || !archivedCodes.has(board)) return null;
  if (!rest) return `/${encodeURIComponent(board)}`;
  if (/^[a-zA-Z0-9]{46}$/.test(rest)) return `/${encodeURIComponent(board)}/thread/${rest}`;
  return `/search?q=${encodeURIComponent(rest)}&board=${encodeURIComponent(board)}`;
}

function tokenize(text: string, parseSpoilers: boolean): Token[] {
  const tokens: Token[] = [];
  const regex = new RegExp(parseSpoilers ? COMBINED : COMBINED_WITHOUT_SPOILER);
  const offset = parseSpoilers ? 0 : -2;
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) });
    if (parseSpoilers && match[1] !== undefined) {
      tokens.push({ type: 'spoiler', tokens: tokenize(match[2] ?? '', false) });
    } else if (match[3 + offset] !== undefined) {
      tokens.push({ type: 'markdownLink', text: match[4 + offset], href: match[5 + offset] });
    } else if (match[6 + offset] !== undefined) {
      tokens.push({ type: 'crossBoardLink', display: match[6 + offset], route: crossBoardRoute(match[6 + offset]) });
    } else if (match[8 + offset] !== undefined) {
      tokens.push({ type: 'quoteLink', number: Number(match[9 + offset]) });
    } else {
      tokens.push({ type: 'url', href: match[0] });
    }
    last = start + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

/** 5chan's hash routes and site-relative links point at pages the archive mirrors. */
function markdownHref(href: string): { href: string; internal: boolean } | null {
  if (href.startsWith('https://') || href.startsWith('http://')) return { href, internal: false };
  if (href.startsWith('/#/')) return { href: href.slice(2), internal: true };
  if (href.startsWith('#/')) return { href: href.slice(1), internal: true };
  if (href.startsWith('/') && !href.startsWith('//')) return { href, internal: true };
  return null;
}

const External = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer nofollow">
    {children}
  </a>
);

export function QuoteLink({ number, resolve }: { number: number; resolve: ResolveQuote }) {
  const target = resolve(number);
  const label = (
    <>
      {'>>'}
      {number}
      {target?.op ? ' (OP)' : null}
    </>
  );
  return target ? (
    <a href={target.href} className={post.quoteLink}>
      {label}
    </a>
  ) : (
    <span className={post.quoteLink}>{label}</span>
  );
}

function renderToken(token: Token, key: number, resolve: ResolveQuote): ReactNode {
  switch (token.type) {
    case 'text':
      return <Fragment key={key}>{token.value}</Fragment>;
    case 'markdownLink': {
      const link = markdownHref(token.href);
      if (!link) return <Fragment key={key}>{token.text}</Fragment>;
      return link.internal ? (
        <Link key={key} href={link.href}>
          {token.text}
        </Link>
      ) : (
        <External key={key} href={link.href}>
          {token.text}
        </External>
      );
    }
    case 'url': {
      const { href, trailing } = splitUrlTrailingText(token.href);
      return (
        <Fragment key={key}>
          <External href={href}>{href}</External>
          {trailing}
        </Fragment>
      );
    }
    case 'quoteLink':
      return (
        <span key={key} className={md.inlineQuoteLink}>
          <QuoteLink number={token.number} resolve={resolve} />
        </span>
      );
    case 'crossBoardLink':
      return token.route ? (
        <Link key={key} href={token.route}>
          {token.display}
        </Link>
      ) : (
        <Fragment key={key}>{token.display}</Fragment>
      );
    case 'spoiler':
      return (
        <span key={key} className="spoilertext">
          {token.tokens.map((inner, i) => renderToken(inner, i, resolve))}
        </span>
      );
  }
}

/** Lines keyed by their offset in the text, as 5chan's renderTextLines does. */
function splitLines(text: string): { line: string; offset: number }[] {
  let offset = 0;
  return text.split('\n').map((line) => {
    const entry = { line, offset };
    offset += line.length + 1;
    return entry;
  });
}

export function Markdown({ content, resolve }: { content: string; resolve: ResolveQuote }) {
  return (
    <span className={md.markdown}>
      {splitLines(normalizeContent(content)).map(({ line, offset }) => {
        const rendered = tokenize(line, true).map((token, i) => renderToken(token, i, resolve));
        return (
          <Fragment key={offset}>
            {offset > 0 ? <br /> : null}
            {line.length === 0 ? null : isGreentextLine(line) ? <span className="greentext">{rendered}</span> : rendered}
          </Fragment>
        );
      })}
    </span>
  );
}
