import { spawn } from 'node:child_process';
import {
  appLabel,
  assertInvokedFromThisCheckout,
  ensurePortlessProxy,
  ensureWebuiDependencies,
  fallbackHost,
  fallbackUrlHost,
  forwardChildExit,
  getLocalServerCommand,
  getPortlessAppName,
  nextBin,
  openInBrowser,
  portlessBin,
  portlessEnv,
  waitForUrlReady,
  webuiDir,
} from './local-server-utils.mjs';
import { resolvePort } from './dev-server-utils.mjs';

const fallbackRequestedPort = Number(process.env.PORT) || 3000;

assertInvokedFromThisCheckout();

console.log('Note: yarn start runs Next.js in development mode. Use yarn start:preview for production-like local performance checks.');

ensureWebuiDependencies();

const command = getLocalServerCommand();
let args;
let env = process.env;
let publicUrl = null;

if (command === portlessBin) {
  ensurePortlessProxy();
  const appName = getPortlessAppName();

  publicUrl = `https://${appName}.localhost`;
  // portless assigns the child port via PORT, which `next dev` respects.
  args = [appName, nextBin, 'dev'];
  env = portlessEnv;

  if (appName !== appLabel) {
    console.log(`Starting Portless dev server at ${publicUrl}`);
  }
} else {
  const port = await resolvePort(fallbackRequestedPort, fallbackHost);
  const fallbackUrl = `http://${fallbackUrlHost}:${port}`;

  args = ['dev', '--hostname', fallbackHost, '--port', String(port)];

  if (process.env.PORTLESS !== '0') {
    console.warn(`portless unavailable on this platform, using next directly on ${fallbackUrl}`);
  } else {
    console.log(`Starting Next.js directly at ${fallbackUrl}`);
  }

  if (port !== fallbackRequestedPort) {
    console.log(`Preferred port ${fallbackRequestedPort} is busy, so this run will use ${fallbackUrl}.`);
  }
}

const child = spawn(command, args, {
  cwd: webuiDir,
  stdio: 'inherit',
  env,
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
