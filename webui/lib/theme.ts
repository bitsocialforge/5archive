import type { Community } from './types';

/**
 * 5chan's theme choice (src/hooks/use-theme.ts with default settings): the
 * home page and multiboard views use Yotsuba; a board uses Yotsuba when it is
 * NSFW and Yotsuba B otherwise.
 */
export type Theme = 'yotsuba' | 'yotsuba-b';

export const multiboardTheme: Theme = 'yotsuba';

/** A directory is NSFW when any board holding its code is. */
export const boardTheme = (boards: (Pick<Community, 'nsfw'> | null)[]): Theme =>
  boards.some((board) => board?.nsfw === 1) ? 'yotsuba' : 'yotsuba-b';
