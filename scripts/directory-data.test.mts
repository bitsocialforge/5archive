import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDirectories, parseListing, parseSource } from './directory-data.mts';

test('directory input validation rejects malformed upstream data before writing crawl scope', () => {
  assert.throws(() => parseSource({ boards: [{ address: 4 }] }, 'boards'), /address/);
  assert.throws(() => parseSource({ boards: [{ address: 'a.bso', score: '2' }] }, 'boards'), /score/);
  assert.throws(() => parseSource({ boards: [] }, 'communities'), /communities/);
  assert.throws(() => parseListing([{ name: 'boards.json', download_url: null }]), /Download URL/);
  assert.throws(() => parseDirectories([{ code: 'biz', title: 'Business', boards: ['a.bso'], former: [null] }]), /Former/);
});

test('validated directory input retains candidate rank and route history', () => {
  assert.deepEqual(parseSource({ communities: [{ address: ' a.bso ', score: 2, directoryCode: 'news' }], tags: ['news'] }, 'communities'), {
    boards: [{ address: 'a.bso', score: 2, directoryCode: 'news' }], tags: ['news'],
  });
  assert.deepEqual(parseListing([{ name: 'ignored', type: 'dir', download_url: null }, { name: 'boards.json', download_url: 'https://example.test/boards.json' }]), [
    { name: 'boards.json', download_url: 'https://example.test/boards.json' },
  ]);
  const stored = [{ code: 'news', title: 'News', boards: ['a.bso'], former: ['old.bso'], description: 'News', tags: ['news'] }];
  assert.deepEqual(parseDirectories(stored), stored);
});

test('listing validates URLs only for selected directory and defaults files', () => {
  for (const prefix of ['5chan', 'seedit']) {
    const directory = `${prefix}-news-directory.json`;
    const defaults = `${prefix}-directories-defaults.json`;
    const accepts = (name: string) => name === directory || name === defaults;
    const selected = [
      { name: directory, download_url: 'https://example.test/news.json' },
      { name: defaults, download_url: 'https://example.test/defaults.json' },
    ];
    assert.deepEqual(parseListing([
      { name: 'unrelated-submodule', type: 'file', download_url: null },
      { name: 'README.md', type: 'file', download_url: null },
      ...selected,
    ], accepts), selected);
    for (const name of [directory, defaults]) {
      for (const download_url of [null, undefined, '']) {
        assert.throws(() => parseListing([{ name, download_url }], accepts), /Download URL/);
      }
    }
  }
});
