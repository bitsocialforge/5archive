import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findJavaScriptSources } from './check-typescript-sources.mts';

test('source coverage rejects new JavaScript in application, script and test directories', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'typescript-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = ['src/view.jsx', 'scripts/nested/task.mjs', 'webui/lib/value.js', 'webui/tests/helper.cjs'];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  assert.deepEqual(findJavaScriptSources(root), [...files].sort());
});

test('source coverage accepts TypeScript and leaves external skills and generated bundles outside its scope', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'typescript-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['src/view.tsx', 'scripts/task.mts', 'webui/tests/helper.mts', '.agents/skills/vendor/tool.mjs', 'dist/app.js', 'webui/.next/server/app.js']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  assert.deepEqual(findJavaScriptSources(root), []);
});
