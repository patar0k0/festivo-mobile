export type MobileDiagnosticLevel = 'info' | 'warn' | 'error';

export type MobileDiagnosticEventType =
  | 'planner_hydrate_start'
  | 'planner_hydrate_success'
  | 'planner_hydrate_partial'
  | 'planner_hydrate_error'
  | 'planner_toggle_optimistic'
  | 'planner_toggle_reconcile'
  | 'planner_toggle_rollback'
  | 'planner_queue_enqueue'
  | 'planner_queue_replay_start'
  | 'planner_queue_replay_success'
  | 'planner_queue_replay_error'
  | 'reminder_update'
  | 'reminder_rollback'
  | 'recommendations_fetch_start'
  | 'recommendations_fetch_success'
  | 'recommendations_fetch_error'
  | 'recommendations_empty_section'
  | 'planner_hint_apply'
  | 'planner_section_promote';

export type MobileDiagnosticScope = 'planner' | 'recommendations' | 'queue' | (string & {});

export type MobileDiagnosticMeta = Record<string, unknown>;

export type MobileDiagnosticEvent = {
  ts: number;
  type: MobileDiagnosticEventType;
  level: MobileDiagnosticLevel;
  scope: MobileDiagnosticScope;
  message: string;
  meta?: MobileDiagnosticMeta;
};

export type MobileDiagnosticEventInput = Omit<MobileDiagnosticEvent, 'ts' | 'message' | 'meta'> & {
  ts?: number;
  message: string;
  meta?: unknown;
};

export type MobileDiagnosticStats = {
  total: number;
  warnings: number;
  errors: number;
  byScope: Record<string, number>;
  byType: Record<string, number>;
};

const MAX_EVENTS = 300;
const MAX_STRING_LENGTH = 220;
const MAX_META_DEPTH = 3;
const MAX_OBJECT_KEYS = 20;
const MAX_ARRAY_ITEMS = 10;

const SENSITIVE_KEY_RE =
  /authorization|auth|access.?token|refresh.?token|id.?token|jwt|cookie|set-cookie|headers?|password|secret|api.?key|payload|body|response|data/i;

const events: MobileDiagnosticEvent[] = [];

function truncateString(value: string): string {
  const scrubbed = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(access_token|refresh_token|id_token|token|api_key|authorization|cookie)=([^\s&]+)/gi, '$1=[redacted]');
  if (scrubbed.length <= MAX_STRING_LENGTH) return scrubbed;
  return `${scrubbed.slice(0, MAX_STRING_LENGTH)}...`;
}

function sanitizeMetaValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString();
  if (value instanceof Error) {
    return {
      name: truncateString(value.name),
      message: truncateString(value.message),
    };
  }
  if (typeof value !== 'object') return '[unknown]';
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_META_DEPTH) return '[truncated]';

  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeMetaValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`...${value.length - MAX_ARRAY_ITEMS} more`);
    }
    seen.delete(value);
    return items;
  }

  const out: MobileDiagnosticMeta = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  for (const [key, raw] of entries) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '[redacted]' : sanitizeMetaValue(raw, depth + 1, seen);
  }
  const extraKeyCount = Object.keys(value as Record<string, unknown>).length - entries.length;
  if (extraKeyCount > 0) {
    out.__extraKeys = extraKeyCount;
  }
  seen.delete(value);
  return out;
}

function sanitizeMeta(meta: unknown): MobileDiagnosticMeta | undefined {
  if (meta == null) return undefined;
  const sanitized = sanitizeMetaValue(meta, 0, new WeakSet<object>());
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return { value: sanitized };
  }
  return sanitized as MobileDiagnosticMeta;
}

export function pushMobileDiagnosticEvent(event: MobileDiagnosticEventInput): MobileDiagnosticEvent {
  const next: MobileDiagnosticEvent = {
    ts: event.ts ?? Date.now(),
    type: event.type,
    level: event.level,
    scope: event.scope,
    message: truncateString(event.message),
    meta: sanitizeMeta(event.meta),
  };

  events.unshift(next);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
  return next;
}

export function getMobileDiagnosticEvents(): MobileDiagnosticEvent[] {
  return events.map((event) => ({ ...event, meta: event.meta ? { ...event.meta } : undefined }));
}

export function clearMobileDiagnosticEvents(): void {
  events.length = 0;
}

export function getMobileDiagnosticStats(): MobileDiagnosticStats {
  const stats: MobileDiagnosticStats = {
    total: events.length,
    warnings: 0,
    errors: 0,
    byScope: {},
    byType: {},
  };

  for (const event of events) {
    if (event.level === 'warn') stats.warnings += 1;
    if (event.level === 'error') stats.errors += 1;
    stats.byScope[event.scope] = (stats.byScope[event.scope] ?? 0) + 1;
    stats.byType[event.type] = (stats.byType[event.type] ?? 0) + 1;
  }

  return stats;
}
