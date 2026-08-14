// Installs webui/ dependencies with npm (it keeps its own lockfile because
// Vercel deploys that directory as the project root). Runs from the root
// `yarn install` postinstall hook; pass --force to reinstall unconditionally.
import { ensureWebuiDependencies } from './local-server-utils.mjs';

ensureWebuiDependencies({ force: process.argv.includes('--force') });
