import type { Comment, Community, Health, PostPage, SearchResult, Thread } from './types.ts';

/** JSON is untrusted even when the indexer advertises a successful response. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNullableNumber = (value: unknown): value is number | null => value === null || isNumber(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isFlag = (value: unknown): value is 0 | 1 => value === 0 || value === 1;
const optionalFlag = (value: Record<string, unknown>, key: string) => !(key in value) || isFlag(value[key]);

export function isCommunity(value: unknown): value is Community {
  return isRecord(value)
    && typeof value.address === 'string'
    && isNullableString(value.title)
    && isNullableString(value.description)
    && isNumber(value.added_at)
    && isNullableNumber(value.last_indexed_at)
    && isNumber(value.post_count)
    && optionalFlag(value, 'nsfw');
}

export function isCommunities(value: unknown): value is { communities: Community[] } {
  return isRecord(value) && Array.isArray(value.communities) && value.communities.every(isCommunity);
}

/** Validate the flattened row; never recover missing/redacted content from raw. */
export function isComment(value: unknown): value is Comment {
  return isRecord(value)
    && typeof value.cid === 'string'
    && typeof value.community_address === 'string'
    && typeof value.post_cid === 'string'
    && isNullableString(value.parent_cid)
    && isNumber(value.depth)
    && isNumber(value.timestamp)
    && isNullableString(value.author_address)
    && isNullableString(value.author_name)
    && isNullableString(value.title)
    && isNullableString(value.content)
    && isNullableString(value.link)
    && isNullableString(value.thumbnail_url)
    && isNumber(value.reply_count)
    && isNumber(value.indexed_at)
    && isFlag(value.archived)
    && isFlag(value.removed)
    && isFlag(value.deleted)
    && isNullableString(value.mod_reason)
    && isFlag(value.takedown)
    && isNullableString(value.takedown_reason)
    && optionalFlag(value, 'nsfw')
    && (!('raw' in value) || isNullableString(value.raw));
}

export function isPostPage(value: unknown): value is PostPage {
  return isRecord(value)
    && Array.isArray(value.posts) && value.posts.every(isComment)
    && isNumber(value.page) && Number.isInteger(value.page) && value.page > 0
    && isNumber(value.limit) && Number.isInteger(value.limit) && value.limit > 0
    && isNumber(value.total) && Number.isInteger(value.total) && value.total >= 0;
}

export function isSearchResult(value: unknown): value is SearchResult {
  return isPostPage(value) && 'query' in value && typeof value.query === 'string';
}

export function isThread(value: unknown): value is Thread {
  return isRecord(value) && isComment(value.post) && Array.isArray(value.replies) && value.replies.every(isComment);
}

export function isHealth(value: unknown): value is Health {
  return isRecord(value)
    && typeof value.status === 'string'
    && typeof value.site === 'string'
    && isNumber(value.communities)
    && isNumber(value.posts)
    && isNumber(value.replies)
    && isNullableNumber(value.lastIndexedAt);
}
