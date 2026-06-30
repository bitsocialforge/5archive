#!/usr/bin/env node
/**
 * Aggregate the 5chan board directories from bitsocialnet/lists into a flat
 * community list for the indexer's COMMUNITIES_SOURCE.
 *
 * Each `5chan-<code>-directory.json` lists the boards competing for a directory
 * code; we collect every board address across all of them.
 *
 *   node scripts/build-communities.mjs        # writes config/communities.json
 *
 * Set GITHUB_TOKEN to raise the API rate limit (only one API call is made; the
 * per-file fetches hit raw.githubusercontent.com and aren't rate-limited).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'bitsocialnet/lists';
const DIR = '5chan-directories';
const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'config', 'communities.json');

const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
const ua = { 'User-Agent': '5archive-build', ...auth };

const listing = await (await fetch(`https://api.github.com/repos/${REPO}/contents/${DIR}`, {
  headers: { ...ua, Accept: 'application/vnd.github+json' },
})).json();

if (!Array.isArray(listing)) throw new Error(`Unexpected listing: ${JSON.stringify(listing).slice(0, 200)}`);

const files = listing.filter((f) => /^5chan-.+-directory\.json$/.test(f.name) && f.name !== '5chan-directories-defaults.json');

const addresses = new Set();
for (const f of files) {
  const data = await (await fetch(f.download_url, { headers: ua })).json();
  for (const board of data.boards ?? []) if (board?.address) addresses.add(board.address);
}

const list = [...addresses].sort();
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(list, null, 2)}\n`);
console.log(`Wrote ${list.length} communities (from ${files.length} directories) to config/communities.json`);
