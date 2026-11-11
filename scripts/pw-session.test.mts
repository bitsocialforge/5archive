import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const wrapper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pw-session.sh');

// A stand-in for playwright-cli. Like the real CLI, `open` lists the session as
// open only once its browser has finished launching (launch-seconds), and
// `close` stops the browser before the command returns (close-seconds). The
// launching-<session> marker shows that a launch has begun and holds the PID of
// the process doing it.
const FAKE_CLI = `#!/bin/bash
dir="$(dirname "$0")"
if [ "\${1:-}" = list ]; then
  for marker in "$dir"/open-*; do
    [ -e "$marker" ] || continue
    echo "- \${marker##*/open-}:"
    echo "  - status: open"
  done
  exit 0
fi
session="\${1#-s=}"
case "\${2:-}" in
  open)
    echo "$$" >"$dir/launching-$session"
    sleep "$(cat "$dir/launch-seconds")" </dev/null >/dev/null 2>&1
    : >"$dir/open-$session"
    ;;
  close)
    if [ -e "$dir/open-$session" ]; then
      rm -f "$dir/open-$session"
      sleep "$(cat "$dir/close-seconds")" </dev/null >/dev/null 2>&1
    else
      echo "Browser '$session' is not open."
    fi
    ;;
esac
exit 0
`;

let dir = '';
const lock = () => path.join(dir, 'slot.lock');
const env = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PLAYWRIGHT_RESOURCE_LOCK_DIR: lock(),
  PLAYWRIGHT_CLI_BIN: path.join(dir, 'fake-playwright-cli'),
});
const browserOpen = (session: string) => existsSync(path.join(dir, `open-${session}`));
const owner = () => {
  try {
    return readFileSync(path.join(lock(), 'owner'), 'utf8').trim();
  } catch {
    return '';
  }
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const launcher = (session: string) => {
  try {
    return Number(readFileSync(path.join(dir, `launching-${session}`), 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
};
const running = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function until(condition: () => boolean, label: string) {
  for (const started = Date.now(); !condition(); await sleep(20)) {
    if (Date.now() - started > 10_000) throw new Error(`Timed out waiting for ${label}`);
  }
}

function run(...args: string[]) {
  const result = spawnSync('bash', [wrapper, ...args], { encoding: 'utf8', env: env() });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Runs the wrapper in the background, as the Jev driver and perf runner do through execFile. */
function start(...args: string[]) {
  const child = spawn('bash', [wrapper, ...args], { env: env() });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk));
  const exited = new Promise<{ code: number | null; output: string }>((resolve) =>
    child.once('exit', (code) => resolve({ code, output })),
  );
  return { child, exited };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pw-session-test-'));
  writeFileSync(path.join(dir, 'fake-playwright-cli'), FAKE_CLI, { mode: 0o755 });
  writeFileSync(path.join(dir, 'launch-seconds'), '0');
  writeFileSync(path.join(dir, 'close-seconds'), '0');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('a slot whose browser is still launching is not reclaimed by a second opener', async () => {
  writeFileSync(path.join(dir, 'launch-seconds'), '1');
  const first = start('open', 'first', 'about:blank');
  await until(() => owner() === 'first', 'the first opener to take the slot');
  assert.equal(browserOpen('first'), false);

  const second = run('open', 'second', 'about:blank');
  assert.equal(second.code, 75, second.output);
  assert.doesNotMatch(second.output, /reclaimed/);

  assert.equal((await first.exited).code, 0);
  assert.equal(owner(), 'first');
  assert.equal(browserOpen('second'), false);
  assert.equal(run('close', 'first').code, 0);
  assert.equal(existsSync(lock()), false);
});

test('a slot whose browser is shutting down stays with its owner until released', async () => {
  writeFileSync(path.join(dir, 'close-seconds'), '1');
  assert.equal(run('open', 'first', 'about:blank').code, 0);
  const closing = start('close', 'first');
  await until(() => !browserOpen('first'), 'the first browser to stop');

  const second = run('open', 'second', 'about:blank');
  assert.equal(second.code, 75, second.output);

  const closed = await closing.exited;
  assert.equal(closed.code, 0, closed.output);
  assert.match(closed.output, /released browser slot for 'first'/);
  assert.equal(existsSync(lock()), false);
});

test('an old opener PID left in the lock cannot hold a stale slot forever', () => {
  assert.equal(run('open', 'first', 'about:blank').code, 0);
  rmSync(path.join(dir, 'open-first'));
  // A wrapper killed with SIGKILL leaves its PID behind, and the system can hand
  // that PID to an unrelated long-lived process (this test runner stands in).
  const pidFile = path.join(lock(), 'pid');
  writeFileSync(pidFile, `${process.pid}\n`);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
  utimesSync(pidFile, tenMinutesAgo, tenMinutesAgo);

  const second = run('open', 'second', 'about:blank');
  assert.equal(second.code, 0, second.output);
  assert.match(second.output, /reclaimed stale slot from 'first'/);
  assert.equal(owner(), 'second');
});

test('a stale slot is still reclaimed once its opener and browser are gone', () => {
  assert.equal(run('open', 'first', 'about:blank').code, 0);
  rmSync(path.join(dir, 'open-first'));

  const second = run('open', 'second', 'about:blank');
  assert.equal(second.code, 0, second.output);
  assert.match(second.output, /reclaimed stale slot from 'first'/);
  assert.equal(owner(), 'second');
});

test('killing the wrapper during launch stops the launch and frees the slot', async () => {
  writeFileSync(path.join(dir, 'launch-seconds'), '1');
  const opening = start('open', 'first', 'about:blank');
  await until(() => launcher('first') > 0, 'the browser launch to begin');
  const launch = launcher('first');
  // execFile's timeout signals only the wrapper process, not its children.
  opening.child.kill('SIGTERM');
  assert.notEqual((await opening.exited).code, 0);
  // The Jev driver and perf runner then run their normal cleanup.
  assert.equal(run('close', 'first').code, 0);

  // A launch that outlived the wrapper opens its browser before it exits, so
  // check only once it is gone, however slow the host.
  await until(() => !running(launch), 'the launch to end');
  assert.equal(browserOpen('first'), false, 'the cancelled launch left a browser running');
  assert.equal(existsSync(lock()), false);
});
