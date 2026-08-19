/** Compact relative time from a unix-seconds timestamp. */
export function timeAgo(sec: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  const units: [number, string][] = [
    [31_536_000, 'y'],
    [2_592_000, 'mo'],
    [604_800, 'w'],
    [86_400, 'd'],
    [3_600, 'h'],
    [60, 'm'],
  ];
  for (const [s, label] of units) {
    if (delta >= s) return `${Math.floor(delta / s)}${label} ago`;
  }
  return 'just now';
}

/**
 * Absolute date, fixed locale and UTC so a server render can't disagree with
 * the machine-readable timestamp beside it or drift with the host's timezone.
 */
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatDate = (sec: number): string => dateFormat.format(new Date(sec * 1000));

/** Single-line excerpt for meta descriptions / OG tags. */
export function excerpt(text: string | null | undefined, max = 160): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
