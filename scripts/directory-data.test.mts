import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDefaults, parseDirectories, parseListing, parseSource } from './directory-data.mts';

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

test('optional source fields preserve null fallbacks without normalizing explicit strings', () => {
  for (const field of ['boards', 'communities'] as const) {
    assert.deepEqual(parseSource({
      [field]: [{ address: 'a.bso', score: null, addedAt: null, directoryCode: null }],
      directoryCode: null, tags: null,
    }, field), { boards: [{ address: 'a.bso' }] });
    assert.deepEqual(parseSource({
      [field]: [{ address: 'a.bso', score: 0, addedAt: 0, directoryCode: '' }],
      directoryCode: '', tags: ['', ' '],
    }, field), { boards: [{ address: 'a.bso', score: 0, addedAt: 0 }], directoryCode: '', tags: ['', ' '] });
    assert.deepEqual(parseSource({
      [field]: [{ address: 'a.bso', directoryCode: ' ' }], directoryCode: ' ',
    }, field), { boards: [{ address: 'a.bso', directoryCode: ' ' }], directoryCode: ' ' });
  }
  for (const boards of [undefined, null]) assert.deepEqual(parseSource({ boards }, 'boards'), { boards: [] });
  for (const communities of [undefined, null]) assert.throws(() => parseSource({ communities }, 'communities'), /communities array/);
});

test('defaults preserve null fallbacks and literal blank display text', () => {
  for (const directories of [undefined, null]) assert.deepEqual(parseDefaults({ directories }), {});
  assert.deepEqual(parseDefaults({ directories: { news: null, pics: { title: null, description: null } } }), { news: {}, pics: {} });
  for (const value of ['', ' ']) {
    assert.deepEqual(parseDefaults({ directories: { news: { title: value, description: value } } }), { news: { title: value, description: value } });
  }
});

test('optional metadata still rejects wrong types and non-finite rankings', () => {
  for (const key of ['score', 'addedAt'] as const) {
    for (const value of ['0', false, {}, [], NaN, Infinity, -Infinity]) {
      assert.throws(() => parseSource({ boards: [{ address: 'a.bso', [key]: value }] }, 'boards'), new RegExp(key));
    }
  }
  for (const value of [0, false, {}, []]) {
    assert.throws(() => parseSource({ boards: [], directoryCode: value }, 'boards'), /Directory code/);
    assert.throws(() => parseSource({ boards: [{ address: 'a.bso', directoryCode: value }] }, 'boards'), /Candidate directory code/);
    for (const key of ['title', 'description']) {
      assert.throws(() => parseDefaults({ directories: { news: { [key]: value } } }), new RegExp(key));
    }
  }
  for (const tags of ['', 0, false, {}, [null], [0]]) assert.throws(() => parseSource({ boards: [], tags }, 'boards'), /tags/);
  for (const directories of ['', 0, false, []]) assert.throws(() => parseDefaults({ directories }), /defaults map/);
  for (const value of ['', 0, false, []]) assert.throws(() => parseDefaults({ directories: { news: value } }), /Defaults for news/);
});

test('history accepts the blank strings emitted by legacy builders while requiring valid addresses', () => {
  const stored = [{ code: '', title: '', boards: ['a.bso'], description: ' ', tags: ['', ' '] }];
  assert.deepEqual(parseDirectories(stored), stored);
  for (const value of [null, 0, false, {}, []]) {
    assert.throws(() => parseDirectories([{ code: 'news', title: value, boards: ['a.bso'] }]), /title/);
    assert.throws(() => parseDirectories([{ code: value, title: 'News', boards: ['a.bso'] }]), /code/);
  }
  assert.throws(() => parseDirectories([{ code: 'news', title: '', boards: [''] }]), /boards/);
});
