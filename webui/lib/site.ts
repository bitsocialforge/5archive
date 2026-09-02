// Instance identity, read once when this module loads in the server process, so
// an operator can re-label their instance via env without rebuilding. None of
// these are NEXT_PUBLIC_ vars, so none are inlined into the bundle at build
// time — but a statically prerendered route does freeze whatever the build saw.
// Defaults to Bitsocial.
export const siteName = process.env.SITE_NAME ?? 'Bitsocial';
export const siteBadge = process.env.SITE_BADGE ?? 'Indexer';
export const siteTitle = [siteName, siteBadge].filter(Boolean).join(' ');

/** Public origin of this web UI — canonical URLs, OpenGraph, robots, sitemaps. */
export const siteUrl = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Absolute URL for a site-relative path — sitemaps, JSON-LD. */
export const absUrl = (path: string) => `${siteUrl}${path}`;

/** UI skin: "default" (Bitsocial dark) or "5chan" (classic imageboard). */
export const theme = process.env.THEME === '5chan' ? '5chan' : 'default';

/**
 * Optional footer attribution (e.g. "A Bitsocial Forge product"). Nothing is
 * rendered unless BRAND_TEXT is set; BRAND_URL turns it into a link.
 */
export const brandText = process.env.BRAND_TEXT ?? '';
export const brandUrl = process.env.BRAND_URL ?? '';

/**
 * Contact address for content-removal / takedown requests, shown on /legal.
 * Unset = the page says requests are handled by the instance operator.
 */
export const contactEmail = process.env.CONTACT_EMAIL ?? '';

/**
 * Whether this instance's search returns NSFW results. `false` (the default)
 * matches the API's own safe default; an archive of boards that are NSFW by
 * design sets SHOW_NSFW=true. The UI always sends the value explicitly, so a
 * deployment decides this rather than inheriting whatever the API defaults to.
 */
export const showNsfw = process.env.SHOW_NSFW === 'true';

/**
 * The live network this instance archives (5archive → 5chan). Both must be set
 * for any of the upstream links to render, so a plain indexer stays neutral and
 * never advertises somebody else's app. See lib/upstream.ts for the link rules.
 */
export const upstreamName = process.env.UPSTREAM_NAME ?? '';
export const upstreamUrl = (process.env.UPSTREAM_URL ?? '').replace(/\/+$/, '');

/** Absolute gate on everything upstream-facing. Re-exported by lib/upstream.ts. */
export const hasUpstream = Boolean(upstreamName && upstreamUrl);

/**
 * One-line description of the instance, shared by page metadata and the site's
 * structured data. An instance with no upstream configured must not claim to
 * archive one.
 */
export const siteDescription = hasUpstream
  ? `The permanent archive of ${upstreamName}.`
  : 'A self-hostable search index for the Bitsocial network.';
