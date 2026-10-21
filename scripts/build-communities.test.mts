import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const packageData: unknown = JSON.parse(await readFile(path.join(scripts, '../package.json'), 'utf8'));
assert.ok(typeof packageData === 'object' && packageData !== null && 'name' in packageData);
const seedit = packageData.name === 'seeditarchive';

async function build(malformed: boolean, optional?: 'null' | 'blank') {
  const root = await mkdtemp(path.join(tmpdir(), 'archive-directory-test-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'webui/lib'), { recursive: true });
    for (const name of ['build-communities.mts', 'directory-history.mts', 'directory-data.mts']) {
      await writeFile(path.join(root, 'scripts', name), await readFile(path.join(scripts, name)));
    }
    const previous = [{ code: 'news', title: 'Old news', boards: ['former.bso'] }];
    await writeFile(path.join(root, 'webui/lib/directories.json'), JSON.stringify(previous));
    const prefix = seedit ? 'seedit' : '5chan';
    const candidates = [
      { address: 'low.bso', score: optional === 'null' ? null : 1, addedAt: optional === 'null' ? null : 1 },
      { address: malformed ? null : 'high.bso', score: 5, addedAt: 2 },
      ...(optional === 'null' ? [{ address: 'dated.bso', score: 0, addedAt: 1 }] : []),
    ];
    const metadata = optional === 'null' ? { title: null, description: null } : optional === 'blank' ? { title: '', description: '' } : { title: 'News' };
    const code = optional === 'blank' ? '' : optional === 'null' ? null : 'news';
    const tags = optional === 'blank' ? ['', ' '] : optional === 'null' ? null : ['news'];
    const responses = {
      [`/repos/bitsocialnet/lists/contents/${prefix}-directories`]: [
        { name: 'unrelated-submodule', type: 'file', download_url: null },
        { name: `${prefix}-news-directory.json`, download_url: 'https://fixture.test/news' },
        { name: `${prefix}-directories-defaults.json`, download_url: 'https://fixture.test/metadata' },
      ],
      '/repos/bitsocialnet/lists/contents/seedit-default-subscriptions.json': { download_url: 'https://fixture.test/subscriptions' },
      '/subscriptions': { communities: [{ address: 'default-only.bso', directoryCode: code }] },
      '/news': seedit ? { directoryCode: code, communities: candidates, tags } : { boards: candidates },
      '/metadata': { directories: { news: metadata, '': metadata } },
    };
    const bootstrap = `const responses = ${JSON.stringify(responses)};
globalThis.fetch = async (url) => {
  const pathname = new URL(url).pathname;
  if (!(pathname in responses)) throw new Error('Unexpected fixture request: ' + pathname);
  return new Response(JSON.stringify(responses[pathname]), { status: 200 });
};
await import('./scripts/build-communities.mts');
`;
    await writeFile(path.join(root, 'run.mts'), bootstrap);
    const run = () => spawnSync(process.execPath, ['--experimental-strip-types', path.join(root, 'run.mts')], { encoding: 'utf8' });
    const result = run();
    const history: unknown = JSON.parse(await readFile(path.join(root, 'webui/lib/directories.json'), 'utf8'));
    if (malformed) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Candidate address/);
      assert.deepEqual(history, previous, 'A failed fetch validation must not discard existing routes');
    } else {
      assert.equal(result.status, 0, result.stderr);
      const communities: unknown = JSON.parse(await readFile(path.join(root, 'config/communities.json'), 'utf8'));
      assert.deepEqual(communities, [...(seedit ? ['default-only.bso'] : []), 'high.bso', 'low.bso', ...(optional === 'null' ? ['dated.bso'] : [])].sort());
      const boards = optional === 'null' ? (seedit ? ['high.bso', 'dated.bso', 'low.bso'] : ['high.bso', 'low.bso', 'dated.bso']) : ['high.bso', 'low.bso'];
      const blankCode = optional === 'blank' && seedit;
      assert.deepEqual(history, [{
        code: blankCode ? '' : 'news',
        title: optional === 'null' ? (seedit ? 'news' : '/news/') : optional === 'blank' ? '' : 'News',
        ...(seedit && tags ? { tags } : {}), boards,
        ...(blankCode ? {} : { former: ['former.bso'] }),
      }, ...(blankCode ? [{ code: 'news', title: 'Old news', boards: [], former: ['former.bso'] }] : [])]);
      if (optional) {
        const repeated = run();
        assert.equal(repeated.status, 0, repeated.stderr);
        assert.deepEqual(JSON.parse(await readFile(path.join(root, 'webui/lib/directories.json'), 'utf8')), history, 'The next run must accept its own stored history');
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('native TypeScript directory builder preserves rank, crawl scope, and historic URLs', () => build(false));
test('directory builder rejects malformed responses without rewriting history', () => build(true));

test('directory builder retains null metadata fallbacks and candidate ranking', () => build(false, 'null'));
test('directory builder preserves blank display metadata and reads it on the next run', () => build(false, 'blank'));
