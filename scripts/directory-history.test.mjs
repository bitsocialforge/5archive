// node --test scripts/directory-history.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeDirectories } from './directory-history.mjs';

const biz = (boards, former) => ({ code: 'biz', title: '/biz/ - Business & Finance', boards, ...(former ? { former } : {}) });

test('a board dropped from the list stays under its code', () => {
  assert.deepEqual(mergeDirectories([biz(['a.bso', 'b.bso'])], [biz(['a.bso'])]), [biz(['a.bso'], ['b.bso'])]);
});

test('former boards accumulate, oldest departure first', () => {
  const previous = [biz(['c.bso'], ['a.bso'])];
  assert.deepEqual(mergeDirectories(previous, [biz(['d.bso'])]), [biz(['d.bso'], ['a.bso', 'c.bso'])]);
});

test('a returning board moves back to the current list', () => {
  assert.deepEqual(mergeDirectories([biz(['b.bso'], ['a.bso'])], [biz(['a.bso', 'b.bso'])]), [biz(['a.bso', 'b.bso'])]);
});

test('current order (best score first) wins over the previous order', () => {
  assert.deepEqual(mergeDirectories([biz(['a.bso', 'b.bso'])], [biz(['b.bso', 'a.bso'])]), [biz(['b.bso', 'a.bso'])]);
});

test('a code that leaves the lists keeps its boards as former', () => {
  const g = { code: 'g', title: '/g/ - Technology', boards: ['tech.bso'] };
  assert.deepEqual(mergeDirectories([biz(['a.bso']), g], [g]), [biz([], ['a.bso']), g]);
});

test('an unchanged map is written back unchanged', () => {
  const map = [biz(['a.bso', 'b.bso']), { code: 'g', title: '/g/ - Technology', boards: ['tech.bso'] }];
  assert.deepEqual(mergeDirectories(map, map), map);
});
