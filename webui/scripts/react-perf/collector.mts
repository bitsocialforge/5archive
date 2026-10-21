import type { Fiber } from 'bippy';
import { detectReactBuildType, getDisplayName, getFiberId, getRDTHook, getType, instrument, isCompositeFiber, traverseRenderedFibers, version } from 'bippy';

export interface ReactPerfEvent {
  instanceId: number;
  typeId: number;
  rootId: number;
  rendererId: number;
  commitId: number;
  name: string;
  phase: 'mount' | 'update' | 'unmount';
  at: number;
  source: { file: string; line: number | null } | null;
}
export interface ReactPerfSnapshot {
  schemaVersion: 1;
  collector: 'bippy';
  collectorVersion: string;
  active: boolean;
  buildType: string;
  timeOrigin: number;
  epoch: number;
  startedAt: number;
  endedAt: number;
  renderers: { id: number; version: string | null; buildType: string }[];
  profilerSupported: boolean;
  observedCommit: boolean;
  observedComponent: boolean;
  commits: number;
  events: ReactPerfEvent[];
  profilerCommits: { id: string; phase: string; actualDuration: number; baseDuration: number; startTime: number; commitTime: number }[];
  droppedEvents: number;
  droppedProfilerCommits: number;
  errors: string[];
}
export interface ReactPerfApi {
  schemaVersion: 1;
  reset(): number;
  snapshot(): ReactPerfSnapshot;
  onProfilerRender(id: string, phase: 'mount' | 'update' | 'nested-update', actualDuration: number, baseDuration: number, startTime: number, commitTime: number): void;
  dispose(): void;
}
declare global {
  interface Window {
    __REACT_PERF__?: ReactPerfApi;
    __REACT_PERF_DISABLED__?: boolean;
  }
}

const MAX_EVENTS = 20000;

/** Committed component updates, not render-function calls or abandoned work. */
export function installCollector({ buildType = 'development', maxEvents = MAX_EVENTS }: { buildType?: 'development' | 'profiling'; maxEvents?: number } = {}): ReactPerfApi | null {
  if (typeof window === 'undefined' || window.__REACT_PERF_DISABLED__) return null;
  if (window.__REACT_PERF__?.schemaVersion === 1) return window.__REACT_PERF__;
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > MAX_EVENTS) throw new Error('Invalid React performance event capacity');

  if (typeof version !== 'string') throw new Error('Missing Bippy collector version');
  const collectorVersion = version;
  const types = new WeakMap<object, number>();
  let nextType = 0;
  let epoch = 0;
  let commits = 0;
  let startedAt = performance.now();
  let events: ReactPerfEvent[] = [];
  let profilerCommits: ReactPerfSnapshot['profilerCommits'] = [];
  let droppedEvents = 0;
  let droppedProfilerCommits = 0;
  let profilerSupported = false;
  let observedCommit = false;
  let observedComponent = false;
  let errors: string[] = [];
  let active = true;
  let unmounts = new Set<string>();

  const record = (fiber: Fiber, phase: ReactPerfEvent['phase'], rendererId: number, rootId: number, commitId: number) => {
    if (!isCompositeFiber(fiber)) return;
    const instanceId = getFiberId(fiber);
    const unmountKey = `${rendererId}:${commitId}:${instanceId}`;
    if (phase === 'unmount' && unmounts.has(unmountKey)) return;
    if (events.length >= maxEvents) {
      droppedEvents += 1;
      return;
    }
    if (phase === 'unmount') unmounts.add(unmountKey);
    const type = getType(fiber.type) || fiber.type;
    if ((typeof type !== 'object' || type === null) && typeof type !== 'function') return;
    let typeId = types.get(type);
    if (typeId === undefined) { typeId = ++nextType; types.set(type, typeId); }
    const source = fiber._debugSource;
    observedComponent = true;
    events.push({
      instanceId,
      typeId,
      rootId,
      rendererId,
      commitId,
      name: getDisplayName(type) || '<anonymous>',
      phase,
      at: performance.now(),
      source: source?.fileName ? { file: source.fileName, line: source.lineNumber ?? null } : null,
    });
  };

  const unsubscribe = instrument({
    name: 'bitsocial-react-perf',
    onCommitFiberUnmount(rendererId, fiber) {
      if (!active) return;
      try {
        let root = fiber;
        while (root.return) root = root.return;
        // React calls unmount notifications before onCommitFiberRoot. Some
        // Bippy/renderer combinations omit deletions from the rendered walk.
        record(fiber, 'unmount', rendererId, getFiberId(root), commits + 1);
      } catch (error) {
        if (errors.length < 10) errors.push(String(error));
      }
    },
    onCommitFiberRoot(rendererId, root) {
      if (!active) return;
      observedCommit = true;
      commits += 1;
      const commitId = commits;
      try {
        const rootId = getFiberId(root.current);
        traverseRenderedFibers(root, (fiber, phase) => {
          record(fiber, phase, rendererId, rootId, commitId);
        });
      } catch (error) {
        if (errors.length < 10) errors.push(String(error));
      }
    },
  });

  const api: ReactPerfApi = {
    schemaVersion: 1,
    reset() {
      if (!active) throw new Error('React profiling collector was disposed');
      epoch += 1;
      startedAt = performance.now();
      commits = 0;
      events = [];
      profilerCommits = [];
      unmounts = new Set();
      droppedEvents = 0;
      droppedProfilerCommits = 0;
      // Errors remain sticky: a reset must not turn a broken collector green.
      return epoch;
    },
    onProfilerRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
      if (!active) return;
      profilerSupported = true;
      if (profilerCommits.length >= maxEvents) {
        droppedProfilerCommits += 1;
        return;
      }
      profilerCommits.push({ id, phase, actualDuration, baseDuration, startTime, commitTime });
    },
    snapshot() {
      const renderers = [...(getRDTHook()?.renderers || [])].map(([id, renderer]) => ({
        id,
        version: renderer.version || null,
        buildType: buildType === 'profiling' ? 'profiling' : detectReactBuildType(renderer),
      }));
      return {
        schemaVersion: 1,
        collector: 'bippy',
        collectorVersion,
        active,
        buildType,
        timeOrigin: performance.timeOrigin,
        epoch,
        startedAt,
        endedAt: performance.now(),
        renderers,
        profilerSupported,
        observedCommit,
        observedComponent,
        commits,
        events: events.map((event) => ({ ...event })),
        profilerCommits: profilerCommits.map((commit) => ({ ...commit })),
        droppedEvents,
        droppedProfilerCommits,
        errors: [...errors],
      };
    },
    dispose() {
      active = false;
      unsubscribe();
      if (window.__REACT_PERF__ === api) delete window.__REACT_PERF__;
      events = [];
      profilerCommits = [];
      unmounts.clear();
    },
  };
  window.__REACT_PERF__ = api;
  return api;
}
