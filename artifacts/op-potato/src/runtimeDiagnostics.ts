// TEMP RUNTIME DIAGNOSTICS: remove after the iPhone audio/stall investigation.
type ActivityKind = "admob" | "leaderboard";

interface ActivityState {
  activeCount: number;
  lastAt: number;
  lastOperation: string;
}

const activity: Record<ActivityKind, ActivityState> = {
  admob: { activeCount: 0, lastAt: Number.NEGATIVE_INFINITY, lastOperation: "none" },
  leaderboard: { activeCount: 0, lastAt: Number.NEGATIVE_INFINITY, lastOperation: "none" },
};

export function markRuntimeActivity(
  kind: ActivityKind,
  active: boolean,
  operation: string,
  details?: unknown,
) {
  const now = performance.now();
  const state = activity[kind];
  state.activeCount = Math.max(0, state.activeCount + (active ? 1 : -1));
  state.lastAt = now;
  state.lastOperation = operation;
  console.debug("[TEMP RUNTIME ACTIVITY]", {
    timestamp: new Date().toISOString(),
    performanceNow: now,
    kind,
    active,
    activeCount: state.activeCount,
    operation,
    details,
  });
}

export function noteRuntimeActivity(kind: ActivityKind, operation: string, details?: unknown) {
  const now = performance.now();
  const state = activity[kind];
  state.lastAt = now;
  state.lastOperation = operation;
  console.debug("[TEMP RUNTIME ACTIVITY]", {
    timestamp: new Date().toISOString(),
    performanceNow: now,
    kind,
    active: state.activeCount > 0,
    activeCount: state.activeCount,
    operation,
    details,
  });
}

export function getRuntimeActivitySnapshot(now = performance.now()) {
  return {
    adMob: {
      active: activity.admob.activeCount > 0,
      within500ms: now - activity.admob.lastAt <= 500,
      ageMs: now - activity.admob.lastAt,
      operation: activity.admob.lastOperation,
    },
    leaderboard: {
      active: activity.leaderboard.activeCount > 0,
      within500ms: now - activity.leaderboard.lastAt <= 500,
      ageMs: now - activity.leaderboard.lastAt,
      operation: activity.leaderboard.lastOperation,
    },
  };
}
