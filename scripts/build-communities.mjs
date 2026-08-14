#!/usr/bin/env node
/**
 * Aggregate the 5chan board directories from bitsocialnet/lists into
 *
 *   config/communities.json      flat board list for the indexer's COMMUNITIES_SOURCE
 *   webui/lib/directories.json   directory code -> boards + title, for the web UI's URLs
 *
 * Each `5chan-<code>-directory.json` lists the boards competing for a directory
 * code; the highest-scoring one resolves the code on 5chan itself. 5archive
 * indexes every candidate board and serves them all under the code's URL
 * (5archive.org/biz), so an archived thread stays reachable when the directory
 * rotates to another board. Titles come from `5chan-directories-defaults.json`.
 *
 *   node scripts/build-communities.mjs        # writes both files
 *
 * Set GITHUB_TOKEN to raise the API rate limit (only one API call is made; the
 * per-file fetches hit raw.githubusercontent.com and aren't rate-limited).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'bitsocialnet/lists';
const DIR = '5chan-directories';
const DEFAULTS_FILE = '5chan-directories-defaults.json';
const here = dirname(fileURLToPath(import.meta.url));
const communitiesPath = join(here, '..', 'config', 'communities.json');
const directoriesPath = join(here, '..', 'webui', 'lib', 'directories.json');

const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
const ua = { 'User-Agent': '5archive-build', ...auth };

const getJson = async (url) => (await fetch(url, { headers: ua })).json();

const listing = await getJson(`https://api.github.com/repos/${REPO}/contents/${DIR}`);

if (!Array.isArray(listing)) throw new Error(`Unexpected listing: ${JSON.stringify(listing).slice(0, 200)}`);

const files = listing.filter((f) => /^5chan-.+-directory\.json$/.test(f.name) && f.name !== DEFAULTS_FILE);
const defaultsFile = listing.find((f) => f.name === DEFAULTS_FILE);
const defaults = defaultsFile ? (await getJson(defaultsFile.download_url)).directories ?? {} : {};

const addresses = new Set();
const directories = [];
for (const f of files) {
  const code = f.name.replace(/^5chan-/, '').replace(/-directory\.json$/, '');
  const data = await getJson(f.download_url);
  // Highest score first (how 5chan resolves the code), oldest candidate first on a tie.
  const boards = (data.boards ?? [])
    .filter((b) => b?.address)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.addedAt ?? 0) - (b.addedAt ?? 0))
    .map((b) => b.address);
  if (boards.length === 0) continue;
  for (const address of boards) addresses.add(address);
  directories.push({ code, title: defaults[code]?.title ?? `/${code}/`, boards });
}

directories.sort((a, b) => a.code.localeCompare(b.code));
const communities = [...addresses].sort();

await mkdir(dirname(communitiesPath), { recursive: true });
await writeFile(communitiesPath, `${JSON.stringify(communities, null, 2)}\n`);
await writeFile(directoriesPath, `${JSON.stringify(directories, null, 2)}\n`);
console.log(
  `Wrote ${communities.length} communities to config/communities.json and ` +
    `${directories.length} directories to webui/lib/directories.json (from ${files.length} directory files)`,
);
