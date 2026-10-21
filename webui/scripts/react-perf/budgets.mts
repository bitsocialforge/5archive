import type { ReactPerfSnapshot } from './collector.mts';
import type { ComponentSummary, InstanceSummary, Summary } from './types.mts';
import { isRecord } from './types.mts';
export function assertHealthy(snapshot: ReactPerfSnapshot | null | undefined): ReactPerfSnapshot {
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.active || !snapshot.renderers?.length) {
    throw new Error('React profiling unavailable: collector or renderer missing');
  }
  if (!snapshot.observedCommit || !snapshot.observedComponent || (snapshot.profilerCommits.length && !snapshot.commits))
    throw new Error('React profiling unavailable: Bippy has not observed component commits');
  if (!snapshot.profilerSupported)
    throw new Error('React profiling unavailable: no React Profiler callback; use a development or profiling build with a Profiler boundary');
  if (snapshot.events.some((event) => event.phase === 'mount' || event.phase === 'update') && !snapshot.profilerCommits.length) {
    throw new Error('React profiling unavailable: component work has no timing callbacks in this measurement window');
  }
  if (snapshot.errors.length || snapshot.droppedEvents || snapshot.droppedProfilerCommits) {
    throw new Error(
      `React profiling incomplete: ${snapshot.droppedEvents} component events and ${snapshot.droppedProfilerCommits} timing events dropped; ${snapshot.errors.join('; ')}`,
    );
  }
  return snapshot;
}

export function summarize(snapshot: ReactPerfSnapshot | null, actionMs: number): Summary {
  snapshot = assertHealthy(snapshot);
  const instances = new Map<string, InstanceSummary>();
  const components: Record<string, ComponentSummary> = {};
  for (const event of snapshot.events) {
    const key = `${event.rendererId}:${event.instanceId}`;
    const instance = instances.get(key) || {
      instanceId: event.instanceId,
      typeId: event.typeId,
      rendererId: event.rendererId,
      name: event.name,
      source: event.source,
      mounts: 0,
      updates: 0,
      unmounts: 0,
    };
    const field = ({ mount: 'mounts', update: 'updates', unmount: 'unmounts' } as const)[event.phase];
    if (!field) throw new Error(`Unknown collector phase: ${event.phase}`);
    instance[field] += 1;
    instances.set(key, instance);
    const group = (components[event.name] ||= { mounts: 0, updates: 0, unmounts: 0, typeIds: [] });
    group[field] += 1;
    if (!group.typeIds.includes(event.typeId)) group.typeIds.push(event.typeId);
  }
  // Each boundary is independent; taking the largest boundary sum avoids adding
  // inclusive timings of nested profilers. Reports retain all raw boundaries.
  const boundaries: Record<string, number> = {};
  for (const commit of snapshot.profilerCommits) {
    if (!Number.isFinite(commit.actualDuration) || commit.actualDuration < 0) throw new Error('Invalid React Profiler duration');
    boundaries[commit.id] = (boundaries[commit.id] || 0) + commit.actualDuration;
  }
  return { commits: snapshot.commits, components, instances: [...instances.values()], renderMs: Math.max(0, ...Object.values(boundaries)), boundaries, actionMs };
}

export function checkBudgets(summary: Summary, budgets: unknown): string[] {
  if (!isRecord(budgets) || Object.keys(budgets).length === 0) throw new Error('A checked phase needs an explicit budget');
  const topKeys = new Set(['maxCommits', 'maxRenderMs', 'maxActionMs', 'components']);
  const componentKeys = new Set(['minUpdates', 'maxUpdates', 'minMounts', 'maxMounts', 'minUnmounts', 'maxUnmounts']);
  let constraints = 0;
  for (const key of Object.keys(budgets)) {
    if (!topKeys.has(key)) throw new Error(`Unknown budget: ${key}`);
    if (key !== 'components') constraints += 1;
  }
  if (budgets.components !== undefined && !isRecord(budgets.components)) throw new Error('components budget must be an object');
  const components = isRecord(budgets.components) ? budgets.components : {};
  for (const [name, budget] of Object.entries(components)) {
    if (!isRecord(budget) || !Object.keys(budget).length) throw new Error(`Empty component budget: ${name}`);
    for (const [key, limit] of Object.entries(budget)) {
      if (!componentKeys.has(key)) throw new Error(`Unknown component budget: ${name}.${key}`);
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) throw new Error(`Invalid component budget: ${name}.${key}`);
      constraints += 1;
    }
  }
  if (!constraints) throw new Error('A checked phase needs at least one enforced constraint');
  const failures: string[] = [];
  const ceiling = (label: string, observed: number, limit: unknown) => {
    if (limit === undefined) return;
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) throw new Error(`Invalid budget ${label}`);
    if (observed > limit) failures.push(`${label}: ${observed} exceeds ${limit}`);
  };
  ceiling('commits', summary.commits, budgets.maxCommits);
  ceiling('renderMs', summary.renderMs, budgets.maxRenderMs);
  ceiling('actionMs', summary.actionMs, budgets.maxActionMs);
  for (const [name, budget] of Object.entries(components)) {
    if (!isRecord(budget)) throw new Error(`Invalid component budget: ${name}`);
    const observed = summary.components[name] || { mounts: 0, updates: 0, unmounts: 0, typeIds: [] };
    if (observed.typeIds.length > 1)
      failures.push(`${name}: ambiguous name identifies ${observed.typeIds.length} component types; inspect instance/type IDs and use a unique name for the budget`);
    for (const [phase, field] of [['Updates', 'updates'], ['Mounts', 'mounts'], ['Unmounts', 'unmounts']] as const) {
      const count = observed[field];
      ceiling(`${name}.${field}`, count, budget[`max${phase}`]);
      const minimum = budget[`min${phase}`];
      if (minimum !== undefined) {
        if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 0) throw new Error(`Invalid minimum for ${name}`);
        if (count < minimum) failures.push(`${name}.${field}: ${count} is below ${minimum}`);
      }
    }
  }
  return failures;
}
