export interface Directory {
  code: string;
  title: string;
  boards: string[];
  former?: string[];
  description?: string;
  tags?: string[];
}
export interface Candidate { address: string; score?: number; addedAt?: number; directoryCode?: string }
export interface DirectorySource { boards: Candidate[]; directoryCode?: string; tags?: string[] }
export interface ListingFile { name: string; download_url: string }

export function object(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${source} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, source: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${source} must be a nonempty string`);
  return value;
}
function strings(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${source} must be an array`);
  return value.map((item: unknown) => text(item, source));
}
export function parseListing(value: unknown, accepts: (name: string) => boolean = () => true): ListingFile[] {
  if (!Array.isArray(value)) throw new Error('Unexpected directory listing');
  return value.flatMap((item: unknown) => {
    const entry = object(item, 'Directory listing entry');
    const name = text(entry.name, 'Directory listing name');
    // Unrelated GitHub entries (including submodules) may have no download URL.
    // Validate URLs only for the selected inputs the builder will consume.
    if (entry.type === 'dir' || !accepts(name)) return [];
    return [{ name, download_url: text(entry.download_url, `Download URL for ${name}`) }];
  });
}
export function downloadUrl(value: unknown): string {
  return text(object(value, 'File metadata').download_url, 'File download URL');
}
export function parseSource(value: unknown, field: 'boards' | 'communities'): DirectorySource {
  const data = object(value, 'Directory source');
  const items = data[field];
  if (!Array.isArray(items)) throw new Error(`Directory source has no ${field} array`);
  const boards = items.map((item: unknown): Candidate => {
    const entry = object(item, 'Directory candidate');
    const candidate: Candidate = { address: text(entry.address, 'Candidate address').trim() };
    for (const key of ['score', 'addedAt'] as const) {
      const value = entry[key];
      if (value !== undefined) {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Candidate ${key} must be finite`);
        candidate[key] = value;
      }
    }
    if (entry.directoryCode !== undefined) candidate.directoryCode = text(entry.directoryCode, 'Candidate directory code');
    return candidate;
  });
  return {
    boards,
    ...(data.directoryCode === undefined ? {} : { directoryCode: text(data.directoryCode, 'Directory code') }),
    ...(data.tags === undefined ? {} : { tags: strings(data.tags, 'Directory tags') }),
  };
}
export function parseDefaults(value: unknown): Record<string, { title?: string; description?: string }> {
  const data = object(value, 'Directory defaults');
  if (data.directories === undefined) return {};
  const entries = object(data.directories, 'Directory defaults map');
  return Object.fromEntries(Object.entries(entries).map(([code, value]) => {
    const metadata = object(value, `Defaults for ${code}`);
    return [code, {
      ...(metadata.title === undefined ? {} : { title: text(metadata.title, 'Directory title') }),
      ...(metadata.description === undefined ? {} : { description: text(metadata.description, 'Directory description') }),
    }];
  }));
}
export function parseDirectories(value: unknown): Directory[] {
  if (!Array.isArray(value)) throw new Error('Stored directory history must be an array');
  return value.map((item: unknown) => {
    const entry = object(item, 'Stored directory');
    return {
      code: text(entry.code, 'Directory code'), title: text(entry.title, 'Directory title'),
      boards: strings(entry.boards, 'Directory boards'),
      ...(entry.former === undefined ? {} : { former: strings(entry.former, 'Former boards') }),
      ...(entry.description === undefined ? {} : { description: text(entry.description, 'Directory description') }),
      ...(entry.tags === undefined ? {} : { tags: strings(entry.tags, 'Directory tags') }),
    };
  });
}
