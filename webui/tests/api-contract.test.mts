import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCommunities, getCommunity, getHealth, getPosts, getThread, search } from '../lib/api.ts';
import { isComment, isCommunity, isHealth, isPostPage, isSearchResult, isThread } from '../lib/api-contract.ts';
import type { Comment, Community } from '../lib/types.ts';

const post: Comment = {
  cid: 'post-cid', community_address: 'community.bso', post_cid: 'post-cid', parent_cid: null,
  depth: 0, timestamp: 1_700_000_000, author_address: null, author_name: null,
  title: 'Archived post', content: 'Indexed content', link: null, thumbnail_url: null,
  reply_count: 0, indexed_at: 1_700_000_001, archived: 1,
  removed: 0, deleted: 0, mod_reason: null, takedown: 0, takedown_reason: null,
};
const community: Community = {
  address: 'community.bso', title: null, description: null, added_at: 1_700_000_000,
  last_indexed_at: null, post_count: 1,
};
const page = { posts: [post], page: 1, limit: 25, total: 1 };
const health = { status: 'ok', site: 'archive', communities: 1, posts: 1, replies: 0, lastIndexedAt: null };

test('accepts indexer records, extra fields and nullable redacted rows', () => {
  assert.ok(isCommunity({ ...community, safe_for_work: null }));
  assert.ok(isComment({ ...post, nsfw: 0, raw: null, pending_approval: 0 }));
  for (const state of ['removed', 'deleted', 'takedown']) {
    assert.ok(isComment({ ...post, [state]: 1, title: null, content: null, raw: null }));
  }
  assert.ok(isPostPage({ posts: [], page: 1, limit: 25, total: 0 }));
  assert.ok(isHealth(health));
  assert.ok(isSearchResult({ ...page, query: '' }));
  assert.ok(isThread({ post, replies: [] }));
});

test('rejects malformed nested data and invalid moderation flags', () => {
  for (const value of [null, [], {}, { ...post, removed: '0' }, { ...post, deleted: 2 },
    { ...post, timestamp: NaN }, { ...post, raw: {} }, { ...post, nsfw: undefined }]) {
    assert.equal(isComment(value), false);
  }
  assert.equal(isCommunity({ ...community, post_count: '1' }), false);
  assert.equal(isPostPage({ ...page, posts: [post, { ...post, content: 123 }] }), false);
  assert.equal(isPostPage({ ...page, page: 0 }), false);
  assert.equal(isPostPage({ ...page, total: -1 }), false);
  assert.equal(isSearchResult(page), false);
  assert.equal(isThread({ post, replies: [{ ...post, parent_cid: 42 }] }), false);
  assert.equal(isHealth({ ...health, lastIndexedAt: 'yesterday' }), false);
});

test('every API endpoint validates JSON before returning it', async (t) => {
  let payload: unknown;
  let requestUrl = '';
  let requestOptions: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    requestUrl = String(input);
    requestOptions = options;
    return Response.json(payload);
  });
  const requests: [() => Promise<unknown>, unknown][] = [
    [getHealth, health],
    [getCommunities, { communities: [community] }],
    [() => getCommunity('community.bso'), community],
    [getPosts, page],
    [() => getThread('post/cid'), { post, replies: [] }],
    [() => search('word & another'), { ...page, query: 'word & another' }],
  ];
  for (const [request, expected] of requests) {
    payload = expected;
    assert.deepEqual(await request(), expected);
    payload = { error: 'unexpected successful response' };
    assert.equal(await request(), null);
  }
  payload = { ...page, query: 'word & another' };
  await search('word & another');
  assert.equal(new URL(requestUrl).searchParams.get('q'), 'word & another');
  assert.equal(requestOptions?.cache, 'no-store');
  payload = page;
  await getPosts('', 45);
  assert.deepEqual(requestOptions, { next: { revalidate: 45 } });
});

test('keeps the null fallback for HTTP, JSON and transport failures', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  assert.equal(await getPosts(), null);
  fetchMock.mock.mockImplementation(async () => new Response('not JSON'));
  assert.equal(await getPosts(), null);
  fetchMock.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await getPosts(), null);
});
