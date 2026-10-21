import type { Browser } from 'playwright';
import type { CaseResult, Measure, Report, Scenario, Setup, Target } from './types.mts';
import { errorMessage, parseScenario } from './types.mts';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertHealthy, checkBudgets, summarize } from './budgets.mts';
import { bounded, startServer, startTrace, withBrowser } from './browser.mts';
import { runSelftest, settle, snapshot } from './selftest.mts';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [command = 'check', ...args] = process.argv.slice(2);
const options: { headed?: boolean; help?: boolean; target?: string; scenario?: string; url?: string; cpu?: string; samples?: string; output?: string; actions?: string } = {};
for (let index = 0; index < args.length; index += 1) {
  const name = args[index];
  if (!name) throw new Error('Missing option');
  if (name === '--headed') options.headed = true;
  else if (['--target', '--scenario', '--url', '--cpu', '--samples', '--output', '--actions'].includes(name)) {
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    switch (name) {
      case '--target': options.target = value; break;
      case '--scenario': options.scenario = value; break;
      case '--url': options.url = value; break;
      case '--cpu': options.cpu = value; break;
      case '--samples': options.samples = value; break;
      case '--output': options.output = value; break;
      case '--actions': options.actions = value; break;
    }
  } else if (name === '--help') options.help = true;
  else throw new Error(`Unknown option: ${name}`);
}
if (options.help) {
  console.log(
    'perf:check | perf:record | perf:test\nOptions: --target NAME --scenario NAME --url EXISTING_APP_URL --cpu 1|4 --samples N --output DIRECTORY --headed\n--actions FILE imports a trusted local scenario module (default export with name/path/prepare/run), for an ad hoc interaction.\nChecks replay configured real-app scenarios. Records also replay actions and save JSON plus native Chrome traces.\nNew recordings compare against the configured budgets; missing profiling or exceeded budgets returns nonzero.',
  );
  process.exit(0);
}
if (!['check', 'record', 'selftest'].includes(command)) throw new Error(`Unknown profiling command: ${command}`);
const cpu = Number(options.cpu || (command === 'check' ? 4 : 1));
const samples = Number(options.samples || (command === 'check' ? 3 : 1));
if (![1, 4].includes(cpu)) throw new Error('--cpu must be 1 or 4');
if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new Error('--samples must be an integer from 1 to 10');
const output = path.resolve(packageRoot, options.output || `.react-perf/${command}-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const report: Report = { schemaVersion: 1, command, cpu, samples, viewport: { width: 1280, height: 900 }, output, startedAt: new Date().toISOString(), cases: [], ok: false };
const abort = new AbortController();
const interrupt = () => abort.abort(new Error('Profiling interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const safeName = (name: string) => name.replace(/[^a-z0-9._-]/gi, '-');

async function runCase(browser: Browser, target: Target, scenario: Scenario, origin: string, sample: number) {
  abort.signal.throwIfAborted();
  const context = await bounded(browser.newContext({ viewport: report.viewport }), 'Case context creation');
  const page = await bounded(context.newPage(), 'Case page creation');
  page.setDefaultTimeout(30000);
  const cdp = await bounded(context.newCDPSession(page), 'Case CDP session creation');
  await bounded(cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }), 'CPU throttling setup');
  await context.addInitScript(() => {
    window.__PROFILING__ = true;
    window.__NO_DEV_TOOLBAR__ = true;
  });
  const result: CaseResult = { target: target.name, scenario: scenario.name, sample, phases: [], consoleErrors: [] };
  report.cases.push(result);
  page.on('pageerror', (error) => {
    if (result.consoleErrors.length < 20) result.consoleErrors.push(errorMessage(error));
  });
  let stopTrace: ((filename: string) => Promise<void>) | undefined;
  let rejectCrash: (reason: Error) => void = () => {};
  const crashed = new Promise<never>((_, reject) => {
    rejectCrash = reject;
  });
  // Attach a handler immediately, including crashes during setup.
  void crashed.catch(() => {});
  const onCrash = () => {
    result.crashed = true;
    result.ok = false;
    const error = new Error('Browser page crashed; abandoning this capture and browser');
    abort.abort(error);
    rejectCrash(error);
  };
  page.on('crash', onCrash);
  const tracePath = path.join(output, `${safeName(target.name)}-${safeName(scenario.name)}-${sample}.json.gz`);
  const measure: Measure = async (name, action, budgets, settings = {}) => {
    abort.signal.throwIfAborted();
    // Wait for the budgeted components to settle before opening the window.
    // Unrelated live timers may keep committing elsewhere; those commits remain
    // in the measured report and total budget, but cannot block input readiness.
    await page.evaluate(
      (names) =>
        new Promise<void>((resolve, reject) => {
          const started = performance.now();
          let quietSince = started;
          const count = () => {
            const data = window.__REACT_PERF__?.snapshot();
            return names.length ? data?.events.filter((event) => names.includes(event.name)).length : data?.commits;
          };
          let previous = count();
          const tick = () => {
            const current = count();
            const now = performance.now();
            if (current !== previous) {
              previous = current;
              quietSince = now;
            }
            if (now - quietSince >= 500) resolve();
            else if (now - started > 15000) reject(new Error('React did not become quiet before measurement'));
            else setTimeout(tick, 50);
          };
          tick();
        }),
      Object.keys(budgets.components || {}),
    );
    await settle(page);
    assertHealthy(await snapshot(page));
    const before = await page.evaluate((name) => {
      if (!window.__REACT_PERF__) throw new Error('Missing React collector');
      window.__REACT_PERF__.reset();
      performance.mark(`react-perf:${name}:start`);
      return { timeOrigin: performance.timeOrigin, epoch: window.__REACT_PERF__.snapshot().epoch };
    }, name);
    const start = performance.now();
    await action();
    await settle(page);
    const actionMs = performance.now() - start;
    const data = assertHealthy(await snapshot(page));
    const navigated = data.timeOrigin !== before.timeOrigin;
    if (navigated && !settings.navigation)
      throw new Error(`${name}: document changed; explicitly select navigation coverage to avoid losing the previous document's metrics`);
    if (!navigated && data.epoch !== before.epoch) throw new Error(`${name}: collector reset during measurement`);
    await page.evaluate((name) => performance.mark(`react-perf:${name}:end`), name);
    const summary = summarize(data, actionMs);
    const failures = checkBudgets(summary, budgets);
    const phase = {
      name,
      coverage: navigated ? 'new-document hydration only; previous document excluded' : 'committed updates during action',
      url: page.url(),
      budgets,
      summary,
      snapshot: data,
      failures,
    };
    result.phases.push(phase);
    process.stderr.write(
      `[perf] ${target.name}/${scenario.name} sample ${sample} ${name}: ${summary.commits} commits, ${summary.renderMs.toFixed(1)} ms React, ${failures.length ? failures.join('; ') : 'within budgets'}\n`,
    );
    return phase;
  };
  try {
    await Promise.race([
      crashed,
      (async () => {
        await scenario.prepare?.({ page, origin });
        await page.goto(new URL(scenario.path || '/', origin).href, { waitUntil: 'domcontentloaded', timeout: 180000 });
        stopTrace = await startTrace(page);
        await scenario.run({ page, origin, measure });
        abort.signal.throwIfAborted();
        if (!result.phases.length) throw new Error('Scenario produced no measured phases');
        result.ok = result.phases.every((phase) => !phase.failures.length);
      })(),
    ]);
  } catch (error) {
    result.ok = false;
    result.error = errorMessage(error);
    if (result.crashed || /target crashed|page crashed/i.test(errorMessage(error)) || !browser.isConnected()) abort.abort(error);
    try {
      if (result.crashed || abort.signal.aborted) throw error;
      result.failureSnapshot = await bounded(snapshot(page), 'Failure snapshot', 2000);
      result.pageText = (await page.locator('body').innerText({ timeout: 2000 })).slice(0, 5000);
      result.url = page.url();
    } catch {
      /* Preserve the original error if the page already closed. */
    }
    process.stderr.write(`[perf] ${target.name}/${scenario.name}: ${errorMessage(error)}\n`);
  } finally {
    try {
      if (stopTrace) {
        await stopTrace(tracePath);
        result.trace = tracePath;
      }
    } catch (error) {
      result.ok = false;
      result.traceError = errorMessage(error);
    }
    try {
      await bounded(context.close(), 'Case context close');
    } catch (error) {
      result.ok = false;
      result.cleanupError = errorMessage(error);
      abort.abort(error);
    } finally {
      page.off('crash', onCrash);
    }
  }
  // A crashed/disconnected browser must never run the next sample or scenario.
  abort.signal.throwIfAborted();
}

try {
  await withBrowser(packageRoot, !!options.headed, async (browser) => {
    report.browser = await browser.version();
    if (command === 'selftest' || command === 'check') {
      process.stderr.write('[perf] Validating collector against React compatibility fixtures\n');
      report.selftest = await runSelftest(browser, packageRoot);
      if (command === 'selftest') return;
    }
    const config = (await import('./config.mts')).default;
    let targets = config.targets.filter((target) => !options.target || target.name === options.target);
    if (!targets.length) throw new Error('No matching profiling target');
    if (options.url && targets.length !== 1) throw new Error('--url requires selecting one --target');
    let customScenario: Scenario | undefined;
    if (options.actions) customScenario = parseScenario((await import(pathToFileURL(path.resolve(process.cwd(), options.actions)).href)).default);
    for (const target of targets) {
      const scenarios = customScenario ? [customScenario] : target.scenarios.filter((scenario) => !options.scenario || scenario.name === options.scenario);
      if (!scenarios.length) throw new Error(`No matching scenarios for ${target.name}`);
      let setup: Setup | undefined;
      let server: Awaited<ReturnType<typeof startServer>> | undefined;
      try {
        let origin = options.url;
        if (origin) {
          const url = new URL(origin);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--url must be an HTTP(S) app URL');
          origin = url.href.replace(/\/$/, '');
        } else {
          setup = await target.setup?.();
          process.stderr.write(`[perf] Starting owned ${target.name} server\n`);
          server = await startServer(target.server, packageRoot, setup?.env || {}, path.join(output, `${safeName(target.name)}-server.log`), abort.signal);
          origin = server.origin;
        }
        for (const scenario of scenarios) {
          for (let sample = 1; sample <= samples; sample += 1) await runCase(browser, target, scenario, origin, sample);
        }
      } finally {
        try {
          await server?.stop();
        } finally {
          await setup?.close?.();
        }
      }
    }
  });
  report.ok = command === 'selftest' ? !!report.selftest?.ok : report.cases.length > 0 && report.cases.every((result) => result.ok);
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[perf] ${errorMessage(error)}\n`);
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  report.endedAt = new Date().toISOString();
  const filename = path.join(output, 'report.json');
  await writeFile(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: report.ok, report: filename, cases: report.cases.length, error: report.error || null }));
  process.exitCode = report.ok ? 0 : 1;
}
