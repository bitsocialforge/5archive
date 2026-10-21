import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBudgets } from './budgets.mts';
import { startFixtureApi, threadCid } from './fixture-api.mts';
import { parseScenario } from './types.mts';
import type { Summary } from './types.mts';

test('the native TypeScript performance entrypoint loads and handles help without a browser', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./runner.mts', import.meta.url)), 'check', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /perf:check \| perf:record \| perf:test/);
});

test('fixture API serves deterministic typed posts and rejects unknown routes', async () => {
  const fixture = await startFixtureApi();
  try {
    const response = await fetch(`${fixture.env.INDEXER_API}/api/posts/${threadCid}`);
    assert.equal(response.status, 200);
    const data: unknown = await response.json();
    assert.ok(typeof data === 'object' && data !== null && 'replies' in data);
    assert.ok(Array.isArray(data.replies));
    assert.equal(data.replies.length, 2);
    assert.equal((await fetch(`${fixture.env.INDEXER_API}/unknown`)).status, 404);
  } finally { await fixture.close(); }
});

test('malformed budgets and scenario exports fail closed', () => {
  const summary: Summary = { commits: 1, components: {}, instances: [], renderMs: 1, boundaries: {}, actionMs: 1 };
  assert.throws(() => checkBudgets(summary, { maxCommits: '2' }), /Invalid budget/);
  assert.throws(() => checkBudgets(summary, { components: { Probe: { maxUpdates: '2' } } }), /Invalid component budget/);
  assert.throws(() => checkBudgets(summary, { maxCommit: 2 }), /Unknown budget/);
  assert.throws(() => parseScenario({ name: 'broken', run: true }), /Invalid custom/);
  assert.deepEqual(checkBudgets(summary, { maxCommits: 0 }), ['commits: 1 exceeds 0']);
});
