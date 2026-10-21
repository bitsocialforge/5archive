import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embeddedNumbers, parseRaw } from '../lib/raw-comment.ts';
import type { Comment } from '../lib/types.ts';

test('malformed bookkeeping cannot become a typed comment record', () => {
  for (const raw of [undefined, null, '', '{bad JSON', 'null', '[]', '42',
    JSON.stringify({ comment: [], commentUpdate: 'wrong shape' })]) {
    assert.deepEqual(parseRaw(raw), { comment: {}, update: {} });
  }
  assert.deepEqual(parseRaw('{"comment":{"spoiler":true},"commentUpdate":{"number":10}}'), {
    comment: { spoiler: true }, update: { number: 10 },
  });
});

test('embedded post numbers ignore malformed pages and never expose raw reply content', () => {
  const row = (raw: string | null): Pick<Comment, 'raw'> => ({ raw });
  const raw = JSON.stringify({ commentUpdate: { replies: { pages: {
    broken: { comments: {} },
    valid: { comments: [null, 42, { commentUpdate: 'invalid' }, {
      comment: { content: 'redacted content must stay inaccessible' },
      commentUpdate: { cid: 'reply', number: 7, replies: { pages: {
        nested: { comments: [{ commentUpdate: { cid: 'nested', number: 8 } }] },
      } } },
    }, { commentUpdate: { cid: 'invalid-number', number: '9' } }] },
  } } } });
  assert.deepEqual([...embeddedNumbers(row(raw))], [['reply', 7], ['nested', 8]]);
  assert.deepEqual([...embeddedNumbers(row('{"commentUpdate":{"replies":{"pages":[]}}}'))], []);
  assert.deepEqual([...embeddedNumbers(row(null))], []);
});
