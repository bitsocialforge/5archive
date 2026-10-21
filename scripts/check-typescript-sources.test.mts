import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findJavaScriptSources } from './check-typescript-sources.mts';

test('source coverage rejects new JavaScript in application, script and test directories', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'typescript-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = ['vite.config.js', 'src/view.jsx', 'scripts/nested/task.mjs', 'webui/lib/value.js', 'webui/tests/helper.cjs', 'webui/instrumentation-client.js', 'webui/next.config.mjs'];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  assert.deepEqual(findJavaScriptSources(root), [...files].sort());
});

test('source coverage accepts TypeScript and leaves external skills and generated bundles outside its scope', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'typescript-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['vite.config.ts', 'src/view.tsx', 'scripts/task.mts', 'webui/tests/helper.mts', '.agents/skills/vendor/tool.mjs', 'dist/app.js', 'webui/.next/server/app.js', 'webui/node_modules/vendor/index.js', 'webui/instrumentation-client.ts', 'webui/next.config.ts']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  assert.deepEqual(findJavaScriptSources(root), []);
});
