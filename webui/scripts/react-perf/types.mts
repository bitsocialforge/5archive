import type { Browser, Page } from 'playwright';
import type { ReactPerfSnapshot } from './collector.mts';

export interface Counts { mounts: number; updates: number; unmounts: number }
export interface ComponentSummary extends Counts { typeIds: number[] }
export interface InstanceSummary extends Counts {
  instanceId: number; typeId: number; rendererId: number; name: string;
  source: { file: string; line: number | null } | null;
}
export interface Summary {
  commits: number; components: Record<string, ComponentSummary>; instances: InstanceSummary[];
  renderMs: number; boundaries: Record<string, number>; actionMs: number;
}
export interface ComponentBudget {
  minUpdates?: number; maxUpdates?: number; minMounts?: number; maxMounts?: number;
  minUnmounts?: number; maxUnmounts?: number;
}
export interface Budgets {
  maxCommits?: number; maxRenderMs?: number; maxActionMs?: number;
  components?: Record<string, ComponentBudget>;
}
export interface Phase {
  name: string; coverage: string; url: string; budgets: Budgets; summary: Summary;
  snapshot: ReactPerfSnapshot; failures: string[];
}
export type Measure = (name: string, action: () => Promise<unknown>, budgets: Budgets, settings?: { navigation?: boolean }) => Promise<Phase>;
export interface ScenarioContext { page: Page; origin: string }
export interface Scenario {
  name: string; path?: string;
  prepare?: (context: ScenarioContext) => Promise<void>;
  run: (context: ScenarioContext & { measure: Measure }) => Promise<void>;
}
export interface ServerConfig { command: string[]; cwd?: string; env?: Record<string, string>; readyPath?: string; timeoutMs?: number }
export interface Setup { env: Record<string, string | undefined>; close?: () => Promise<void> }
export interface Target { name: string; server: ServerConfig; setup?: () => Promise<Setup>; scenarios: Scenario[] }
export interface PerfConfig { targets: Target[]; doctorProjects?: { cwd: string }[] }
export interface CaseResult {
  target: string; scenario: string; sample: number; phases: Phase[]; consoleErrors: string[];
  crashed?: boolean; ok?: boolean; error?: string; failureSnapshot?: ReactPerfSnapshot | null;
  pageText?: string; url?: string; trace?: string; traceError?: string; cleanupError?: string;
}
export interface Variant { name: string; reactVersion: string; alias: Record<string, string> }
export interface VariantResult {
  ok: boolean; name: string; reactVersion: string; actualRendererVersions: (string | null)[];
  renderers: ReactPerfSnapshot['renderers']; checks: string[];
}
export interface SelftestResult { ok: boolean; variants: VariantResult[]; checks: string[] }
export interface Report {
  schemaVersion: 1; command: string; cpu: number; samples: number;
  viewport: { width: number; height: number }; output: string; startedAt: string;
  cases: CaseResult[]; ok: boolean; browser?: string; selftest?: SelftestResult;
  error?: string; endedAt?: string;
}

export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Custom scenarios are trusted executable modules, but their exported API is still checked. */
export function parseScenario(value: unknown): Scenario {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name || typeof value.run !== 'function' ||
    (value.path !== undefined && typeof value.path !== 'string') ||
    (value.prepare !== undefined && typeof value.prepare !== 'function')) throw new Error('Invalid custom profiling scenario');
  const run = value.run;
  const prepare = value.prepare;
  return {
    name: value.name,
    ...(typeof value.path === 'string' ? { path: value.path } : {}),
    ...(typeof prepare === 'function' ? { prepare: async (context: ScenarioContext) => { await prepare(context); } } : {}),
    run: async (context) => { await run(context); },
  };
}

export type BrowserRun<T> = (browser: Browser) => Promise<T>;

declare global { interface Window { __PROFILING__?: boolean; __NO_DEV_TOOLBAR__?: boolean } }
