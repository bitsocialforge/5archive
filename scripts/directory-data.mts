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
function stringValue(value: unknown, source: string): string {
  if (typeof value !== 'string') throw new Error(`${source} must be a string`);
  return value;
}
function text(value: unknown, source: string): string {
  const result = stringValue(value, source);
  if (!result.trim()) throw new Error(`${source} must be a nonempty string`);
  return result;
}
function strings(value: unknown, source: string, allowBlank = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${source} must be an array`);
  return value.map((item: unknown) => allowBlank ? stringValue(item, source) : text(item, source));
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
  // 5chan permits an absent board list; Seedit requires its communities array.
  const items = field === 'boards' ? data[field] ?? [] : data[field];
  if (!Array.isArray(items)) throw new Error(`Directory source has no ${field} array`);
  const boards = items.map((item: unknown): Candidate => {
    const entry = object(item, 'Directory candidate');
    const candidate: Candidate = { address: text(entry.address, 'Candidate address').trim() };
    for (const key of ['score', 'addedAt'] as const) {
      const value = entry[key];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Candidate ${key} must be finite`);
        candidate[key] = value;
      }
    }
    if (entry.directoryCode !== undefined && entry.directoryCode !== null) {
      const code = stringValue(entry.directoryCode, 'Candidate directory code');
      // Subscription ordering previously filtered empty codes with filter(Boolean).
      if (code) candidate.directoryCode = code;
    }
    return candidate;
  });
  return {
    boards,
    // Null uses the filename fallback, while an explicit empty code is preserved.
    ...(data.directoryCode === undefined || data.directoryCode === null ? {} : { directoryCode: stringValue(data.directoryCode, 'Directory code') }),
    ...(data.tags === undefined || data.tags === null ? {} : { tags: strings(data.tags, 'Directory tags', true) }),
  };
}
export function parseDefaults(value: unknown): Record<string, { title?: string; description?: string }> {
  const data = object(value, 'Directory defaults');
  if (data.directories === undefined || data.directories === null) return {};
  const entries = object(data.directories, 'Directory defaults map');
  return Object.fromEntries(Object.entries(entries).map(([code, value]) => {
    const metadata = object(value ?? {}, `Defaults for ${code}`);
    return [code, {
      ...(metadata.title === undefined || metadata.title === null ? {} : { title: stringValue(metadata.title, 'Directory title') }),
      ...(metadata.description === undefined || metadata.description === null ? {} : { description: stringValue(metadata.description, 'Directory description') }),
    }];
  }));
}
export function parseDirectories(value: unknown): Directory[] {
  if (!Array.isArray(value)) throw new Error('Stored directory history must be an array');
  return value.map((item: unknown) => {
    const entry = object(item, 'Stored directory');
    return {
      code: stringValue(entry.code, 'Directory code'), title: stringValue(entry.title, 'Directory title'),
      boards: strings(entry.boards, 'Directory boards'),
      ...(entry.former === undefined ? {} : { former: strings(entry.former, 'Former boards') }),
      ...(entry.description === undefined ? {} : { description: stringValue(entry.description, 'Directory description') }),
      ...(entry.tags === undefined ? {} : { tags: strings(entry.tags, 'Directory tags', true) }),
    };
  });
}
