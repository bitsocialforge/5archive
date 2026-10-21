import type { Browser, BrowserContext, Page } from 'playwright';
import type { ReactPerfSnapshot } from './collector.mts';
import type { Variant, VariantResult, SelftestResult } from './types.mts';
import { errorMessage, isRecord } from './types.mts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { assertHealthy, checkBudgets, summarize } from './budgets.mts';
import { bounded } from './browser.mts';

export const settle = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
export const snapshot = (page: Page) => page.evaluate(() => window.__REACT_PERF__?.snapshot() ?? null);

// Resolve from the application package, never from the shared runner's location.
// Directory aliases also cover react/jsx-runtime and react/jsx-dev-runtime. Next's
// compiled DOM/JSX modules import their matching next/dist/compiled React directly,
// so alias those requests too to guarantee one React instance per fixture bundle.
async function resolveVariants(packageRoot: string): Promise<Variant[]> {
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!isRecord(manifest)) throw new Error('Invalid package manifest');
  const packageRequire = createRequire(manifestPath);
  const resolveVariant = (name: string, reactRequest: string, domRequest: string): Variant => {
    const reactDirectory = path.dirname(packageRequire.resolve(`${reactRequest}/package.json`));
    const domDirectory = path.dirname(packageRequire.resolve(`${domRequest}/package.json`));
    const react: unknown = packageRequire(reactRequest);
    if (!isRecord(react) || typeof react.version !== 'string') throw new Error(`Missing React version for ${name}`);
    const reactVersion = react.version;
    assert.equal(typeof reactVersion, 'string', `Missing React version for ${name}`);
    // Explicitly resolve every required entry. A declared Next installation with
    // missing compiled variants is an unsupported setup, not a reason to skip.
    const jsxRuntime = packageRequire.resolve(`${reactRequest}/jsx-runtime`);
    const jsxDevRuntime = packageRequire.resolve(`${reactRequest}/jsx-dev-runtime`);
    packageRequire.resolve(`${domRequest}/client`);
    return {
      name,
      reactVersion,
      alias: {
        react: reactDirectory,
        'react-dom': domDirectory,
        'react/jsx-runtime': jsxRuntime,
        'react/jsx-dev-runtime': jsxDevRuntime,
        [reactRequest]: reactDirectory,
        [domRequest]: domDirectory,
        [`${reactRequest}/jsx-runtime`]: jsxRuntime,
        [`${reactRequest}/jsx-dev-runtime`]: jsxDevRuntime,
      },
    };
  };
  const variants = [resolveVariant('installed-react', 'react', 'react-dom')];
  if (['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => isRecord(manifest[key]) && manifest[key].next)) {
    variants.push(
      resolveVariant('next-compiled', 'next/dist/compiled/react', 'next/dist/compiled/react-dom'),
      resolveVariant('next-experimental', 'next/dist/compiled/react-experimental', 'next/dist/compiled/react-dom-experimental'),
    );
  }
  return variants;
}

export async function runSelftest(browser: Browser, packageRoot: string): Promise<SelftestResult> {
  const variants = [];
  for (const variant of await resolveVariants(packageRoot)) {
    try {
      variants.push(await runVariant(browser, packageRoot, variant));
    } catch (error) {
      throw new Error(`React compatibility failed for ${variant.name} (${variant.reactVersion}): ${errorMessage(error)}`, { cause: error });
    }
  }
  return {
    ok: true,
    variants,
    checks: variants.flatMap((variant) => variant.checks.map((check) => `${variant.name}: ${check}`)),
  };
}

async function runVariant(browser: Browser, packageRoot: string, variant: Variant): Promise<VariantResult> {
  const bundled = await build({
    entryPoints: [path.join(packageRoot, 'scripts/react-perf/fixture.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: variant.alias,
  });
  const output = bundled.outputFiles?.[0];
  if (!output) throw new Error('Fixture bundler produced no output');
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/fixture.js')) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(output.text);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected fixture TCP address');
  const origin = `http://127.0.0.1:${address.port}`;
  let context: BrowserContext | undefined;
  let page: Page;
  const checks: string[] = [];
  let renderers: ReactPerfSnapshot['renderers'] = [];
  const load = async (query = '') => {
    await page.goto(origin + query);
    await page.getByRole('heading', { name: 'React profiling compatibility fixture' }).waitFor();
    await settle(page);
  };
  const measure = async (action: () => Promise<unknown>) => {
    assertHealthy(await snapshot(page));
    await page.evaluate(() => {
      if (!window.__REACT_PERF__) throw new Error('Missing React collector');
      return window.__REACT_PERF__.reset();
    });
    await action();
    await settle(page);
    const data = assertHealthy(await snapshot(page));
    return { data, summary: summarize(data, 0) };
  };
  try {
    context = await bounded(browser.newContext(), 'Fixture context creation');
    page = await bounded(context.newPage(), 'Fixture page creation');
    page.setDefaultTimeout(15000);
    await load();
    const initial = assertHealthy(await snapshot(page));
    renderers = initial.renderers;
    assert.deepEqual([...new Set(renderers.map((renderer) => renderer.version))], [variant.reactVersion],
      `Fixture renderer must match ${variant.name}'s React version`);
    assert.throws(() => assertHealthy({ ...initial, commits: 0, events: [] }), /Bippy has not observed/);
    assert.ok(initial.events.some((event) => event.name === 'StateProbe' && event.phase === 'mount'));
    assert.ok(initial.events.some((event) => event.name === 'MemoProbe' && event.phase === 'mount'));
    assert.throws(() => assertHealthy({ ...initial, profilerCommits: [] }), /no timing callbacks/);
    assert.throws(() => checkBudgets(summarize(initial, 0), { maxCommit: 0 }), /Unknown budget/);
    assert.throws(() => checkBudgets(summarize(initial, 0), { components: { StateProbe: {} } }), /Empty component budget/);
    checks.push('missing window timing and malformed budgets fail closed');
    checks.push('mounts and official Profiler timing available');
    const state = await measure(() => page.getByRole('button', { name: 'State 0', exact: true }).click());
    assert.equal(state.summary.components.StateProbe?.updates, 1);
    checks.push('state update: one committed update under StrictMode');
    const props = await measure(() => page.getByRole('button', { name: 'Props 0', exact: true }).click());
    assert.equal(props.summary.components.PropProbe?.updates, 1);
    assert.equal(props.summary.components.MemoProbe?.updates || 0, 0);
    assert.equal(props.summary.components.SameName?.typeIds.length, 2);
    assert.ok(checkBudgets(props.summary, { components: { SameName: { maxUpdates: 10 } } }).some((failure) => failure.includes('ambiguous')));
    checks.push('prop updates, memo bailout, and distinct same-named component types');
    const contextUpdate = await measure(() => page.getByRole('button', { name: 'Context update', exact: true }).click());
    assert.equal(contextUpdate.summary.components.ContextProbe?.updates, 1);
    checks.push('context update passes through memo');
    const first = await measure(() => page.getByRole('button', { name: 'Instance A 0', exact: true }).click());
    const second = await measure(() => page.getByRole('button', { name: 'Instance A 1', exact: true }).click());
    const a = first.summary.instances.find((instance) => instance.name === 'InstanceProbe');
    assert.equal(first.summary.components.InstanceProbe?.updates, 1);
    const b = second.summary.instances.find((instance) => instance.name === 'InstanceProbe');
    assert.ok(a && b, 'Both update windows must contain the measured instance');
    assert.equal(b.instanceId, a.instanceId);
    assert.equal(initial.events.filter((event) => event.name === 'InstanceProbe' && event.phase === 'mount').length, 2);
    checks.push('instance IDs remain stable across resets and distinguish siblings');
    const remount = await measure(() => page.getByRole('button', { name: 'Remount', exact: true }).click());
    assert.equal(remount.summary.components.RemountProbe?.mounts, 1);
    assert.equal(remount.summary.components.RemountProbe?.unmounts, 1);
    checks.push('remounts are separate mount/unmount events');
    const baseline = await measure(() => page.getByRole('button', { name: 'Regression 0/0', exact: true }).click());
    assert.deepEqual(checkBudgets(baseline.summary, { components: { RegressionProbe: { minUpdates: 1, maxUpdates: 1 } } }), []);
    await load('/?regression=1');
    const regressed = await measure(() => page.getByRole('button', { name: 'Regression 0/0', exact: true }).click());
    assert.ok(checkBudgets(regressed.summary, { components: { RegressionProbe: { maxUpdates: 1 } } }).some((failure) => failure.includes('RegressionProbe.updates')));
    checks.push('deliberate redundant effect update exceeds the passing baseline budget');
    await load('/?disabled=1');
    const disabled = await snapshot(page);
    assert.throws(() => assertHealthy(disabled), /unavailable/);
    checks.push('missing instrumentation fails instead of reporting zero');
    await load('/?no-profiler=1');
    const withoutTimings = await snapshot(page);
    assert.throws(() => assertHealthy(withoutTimings), /no React Profiler callback/);
    checks.push('missing timing instrumentation fails');
    await load('/?overflow=1');
    const overflow = await snapshot(page);
    assert.throws(() => assertHealthy(overflow), /incomplete/);
    checks.push('truncated measurements fail');
  } finally {
    try {
      if (context) await bounded(context.close(), 'Fixture context close');
    } finally {
      server.closeAllConnections();
      await bounded(new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())), 'Fixture server close');
    }
  }
  return {
    ok: true,
    name: variant.name,
    reactVersion: variant.reactVersion,
    actualRendererVersions: [...new Set(renderers.map((renderer) => renderer.version))],
    renderers,
    checks,
  };
}
