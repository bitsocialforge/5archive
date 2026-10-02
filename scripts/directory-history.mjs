/**
 * Merge a freshly built directory map into the previous one without ever
 * dropping a board.
 *
 * 5chan's directory lists change: boards join a code, fall out of it, and the
 * winner rotates. A board's archived threads live at /<code>/thread/<cid>, so
 * if a board that once held /biz/ vanished from the map, every one of its
 * thread URLs would move to /<address>/... The map therefore only grows:
 *
 *   boards   the code's current candidates, best-scoring first (from the lists)
 *   former   boards listed under the code before and not any more, oldest
 *            departures first; omitted when empty
 *
 * A code that disappears from the lists entirely keeps its entry, with every
 * board it ever had under `former`. A former board that comes back moves back
 * into `boards`.
 *
 * @param {{ code: string, title: string, boards: string[], former?: string[] }[]} previous
 * @param {{ code: string, title: string, boards: string[] }[]} current
 */
export function mergeDirectories(previous, current) {
  const merged = new Map();

  for (const dir of current) {
    merged.set(dir.code, { code: dir.code, title: dir.title, boards: [...dir.boards] });
  }

  for (const old of previous) {
    const entry = merged.get(old.code) ?? { code: old.code, title: old.title, boards: [] };
    const listed = new Set(entry.boards);
    const former = [...new Set([...(old.former ?? []), ...old.boards])].filter((address) => !listed.has(address));
    if (former.length > 0) entry.former = former;
    merged.set(old.code, entry);
  }

  return [...merged.values()].sort((a, b) => a.code.localeCompare(b.code));
}
