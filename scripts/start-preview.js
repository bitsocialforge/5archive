import { spawn, spawnSync } from 'node:child_process';
import {
  assertInvokedFromThisCheckout,
  ensurePortlessProxy,
  ensureWebuiDependencies,
  fallbackHost,
  fallbackUrlHost,
  forwardChildExit,
  getLocalServerCommand,
  getPortlessAppName,
  getPreviewEnvDefaults,
  nextBin,
  npmBin,
  openInBrowser,
  portlessBin,
  portlessEnv,
  usePortless,
  waitForUrlReady,
  webuiDir,
} from './local-server-utils.mjs';
import { resolvePort } from './dev-server-utils.mjs';

const fallbackRequestedPort = Number(process.env.PORT) || 4173;

assertInvokedFromThisCheckout();

ensureWebuiDependencies();

const previewEnvDefaults = getPreviewEnvDefaults();

console.log('Building production preview with npm run build in webui/...');

const build = spawnSync(npmBin, ['run', 'build'], {
  cwd: webuiDir,
  env: { ...previewEnvDefaults, ...process.env },
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const command = getLocalServerCommand();
let args;
let env = process.env;
let publicUrl = null;

if (command === portlessBin) {
  ensurePortlessProxy();
  const appName = getPortlessAppName();

  publicUrl = `https://${appName}.localhost`;
  args = [appName, nextBin, 'start'];
  env = portlessEnv;

  console.log(`Starting Portless production preview at ${publicUrl}`);
} else {
  const port = await resolvePort(fallbackRequestedPort, fallbackHost);
  const fallbackUrl = `http://${fallbackUrlHost}:${port}`;

  args = ['start', '--hostname', fallbackHost, '--port', String(port)];

  if (usePortless) {
    console.warn(`portless unavailable on this platform, using next start directly on ${fallbackUrl}`);
  } else {
    console.log(`Starting Next.js production preview directly at ${fallbackUrl}`);
  }

  if (port !== fallbackRequestedPort) {
    console.log(`Preferred preview port ${fallbackRequestedPort} is busy, so this run will use ${fallbackUrl}.`);
  }
}

const child = spawn(command, args, {
  cwd: webuiDir,
  stdio: 'inherit',
  env: { ...previewEnvDefaults, ...env },
});

if (publicUrl && process.env.BROWSER !== 'none') {
  waitForUrlReady(publicUrl, 60_000)
    .then(() => {
      console.log(`Opening ${publicUrl} in browser...`);
      openInBrowser(publicUrl);
    })
    .catch((error) => {
      console.warn(`Could not auto-open ${publicUrl}: ${error.message}`);
    });
}

forwardChildExit(child);
