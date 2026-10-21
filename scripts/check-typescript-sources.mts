import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const maintainedDirectories = [
  'src', 'scripts', 'webui/app', 'webui/components', 'webui/lib', 'webui/scripts', 'webui/tests',
];

/** Keep new JavaScript from silently falling outside allowJs:false projects. */
export function findJavaScriptSources(root: string): string[] {
  const files: string[] = [];
  function visit(relative: string, recursive = true): void {
    let entries;
    try {
      entries = readdirSync(path.join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      // Root configuration and instrumentation files are maintained; generated directories are not.
      if (!recursive && !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Maintained source must not be a symlink: ${name}`);
      if (entry.isDirectory()) { if (recursive) visit(name); }
      else if (/\.(?:[cm]?js|jsx)$/.test(name)) files.push(name);
    }
  }
  visit('.', false);
  visit('webui', false);
  for (const directory of maintainedDirectories) visit(directory);
  return files.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = findJavaScriptSources(root);
  if (files.length) {
    console.error(`Maintained JavaScript sources must be migrated to checked TypeScript:\n${files.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Maintained application and script sources are TypeScript.');
  }
}
