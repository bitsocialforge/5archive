import { directories, type Directory } from './directories';

/**
 * 5chan's navigation vocabulary, so the archive's chrome lists boards exactly
 * where 5chan does. Copied from 5chan src/constants/board-codes.ts and the
 * category columns of src/views/home/boards-list/boards-list.tsx; re-sync from
 * there when 5chan changes its board bar or home page.
 */
export const BOARD_CODE_GROUPS: string[][] = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'gif', 'h', 'hr', 'k', 'm', 'o', 'p', 'r', 's', 't', 'u', 'v', 'vg', 'vm', 'vmg', 'vr', 'vrpg', 'vst', 'w', 'wg'],
  ['i', 'ic', 'oc'],
  ['r9k', 's5s', 'vip', 'q'],
  ['cm', 'hm', 'lgbt', 'y'],
  ['3', 'aco', 'adv', 'an', 'bant', 'biz', 'cgl', 'ck', 'co', 'diy', 'fa', 'fit', 'gd', 'hc', 'his', 'int', 'jp', 'lit', 'mlp', 'mu', 'n', 'news', 'out', 'po', 'pol', 'pw', 'qst', 'sci', 'soc', 'sp', 'tg', 'toy', 'trv', 'tv', 'vp', 'vt', 'wsg', 'wsr', 'x', 'xs'],
];

/**
 * The groups, plus one trailing group for archived codes 5chan's bar doesn't
 * list, so every board this archive holds stays one click away.
 */
export const boardBarGroups = (): string[][] => {
  const listed = new Set(BOARD_CODE_GROUPS.flat());
  const extra = directories.map((d) => d.code).filter((code) => !listed.has(code));
  return extra.length > 0 ? [...BOARD_CODE_GROUPS, extra] : BOARD_CODE_GROUPS;
};

export interface HomeCategory {
  title: string;
  nsfw?: boolean;
  boards: string[];
}

/** The home page's Boards box: columns of categories of board names. */
export const HOME_COLUMNS: HomeCategory[][] = [
  [
    {
      title: 'Japanese Culture',
      boards: ['Anime & Manga', 'Anime/Cute', 'Anime/Wallpapers', 'Mecha', 'Cosplay & EGL', 'Cute/Male', 'Flash', 'Transportation', 'Otaku Culture', 'Virtual YouTubers'],
    },
    {
      title: 'Video Games',
      boards: ['Video Games', 'Video Game Generals', 'Video Games/Multiplayer', 'Video Games/Mobile', 'Pokémon', 'Retro Games', 'Video Games/RPG', 'Video Games/Strategy'],
    },
  ],
  [
    {
      title: 'Interests',
      boards: ['Comics & Cartoons', 'Technology', 'Television & Film', 'Weapons', 'Auto', 'Animals & Nature', 'Traditional Games', 'Sports', 'Extreme Sports', 'Professional Wrestling', 'Science & Math', 'History & Humanities', 'International', 'Outdoors', 'Toys'],
    },
  ],
  [
    {
      title: 'Creative',
      boards: ['Oekaki', 'Papercraft & Origami', 'Photography', 'Food & Cooking', 'Artwork/Critique', 'Wallpapers/General', 'Literature', 'Music', 'Fashion', '3DCG', 'Graphic Design', 'Do It Yourself', 'Worksafe GIF', 'Quests', 'Original Content'],
    },
  ],
  [
    {
      title: 'Other',
      boards: ['Business & Finance', 'Travel', 'Fitness', 'Paranormal', 'Advice', 'LGBT', 'Pony', 'Current News', 'Worksafe Requests', 'Very Important Posts', '5chan Feedback'],
    },
    {
      title: 'Misc.',
      nsfw: true,
      boards: ['Random', 'ROBOT9002', 'Politically Incorrect', 'International/Random', 'Cams & Meetups', 'Shit 5chan Says'],
    },
  ],
  [
    {
      title: 'Adult',
      nsfw: true,
      boards: ['Sexy Beautiful Women', 'Hardcore', 'Handsome Men', 'Hentai', 'Ecchi', 'Yuri', 'Hentai/Alternative', 'Yaoi', 'Torrents', 'High Resolution', 'Adult GIF', 'Adult Cartoons', 'Adult Requests'],
    },
  ],
];

/** "/g/ - Technology" → "Technology", as 5chan's getBoardNameFromDirectoryTitle. */
export const boardName = (title: string) => title.replace(/^\/[^/]+\/\s*-\s*/, '');

const byName = new Map<string, Directory>();
for (const dir of directories) {
  const name = boardName(dir.title);
  if (!byName.has(name)) byName.set(name, dir);
}

export const directoryForName = (name: string): Directory | null => byName.get(name) ?? null;

/** Codes that land somewhere: a bar entry for anything else renders as a placeholder. */
export const archivedCodes = new Set(directories.map((d) => d.code));
