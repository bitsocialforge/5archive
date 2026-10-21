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
