import {
  pushMobileDiagnosticEvent,
  type MobileDiagnosticEvent,
  type MobileDiagnosticEventInput,
  type MobileDiagnosticLevel,
} from '@/lib/debug/mobileDiagnosticsStore';

type DebugLogInput = Omit<MobileDiagnosticEventInput, 'level'> & {
  level?: MobileDiagnosticLevel;
};

const DEFAULT_RARE_WINDOW_MS = 30_000;

const rareLoggedAtByKey = new Map<string, number>();
const onceKeys = new Set<string>();

function withLevel(event: DebugLogInput, level: MobileDiagnosticLevel): MobileDiagnosticEventInput {
  return {
    ...event,
    level,
  };
}

export function debugLogError(event: DebugLogInput): MobileDiagnosticEvent {
  return pushMobileDiagnosticEvent(withLevel(event, 'error'));
}

export function debugLogWarn(event: DebugLogInput): MobileDiagnosticEvent {
  return pushMobileDiagnosticEvent(withLevel(event, 'warn'));
}

export function debugLogRare(
  key: string,
  event: DebugLogInput,
  windowMs = DEFAULT_RARE_WINDOW_MS,
): MobileDiagnosticEvent | null {
  const now = Date.now();
  const previous = rareLoggedAtByKey.get(key) ?? 0;
  if (now - previous < windowMs) return null;
  rareLoggedAtByKey.set(key, now);
  return pushMobileDiagnosticEvent(withLevel(event, event.level ?? 'info'));
}

export function debugLogOnce(key: string, event: DebugLogInput): MobileDiagnosticEvent | null {
  if (onceKeys.has(key)) return null;
  onceKeys.add(key);
  return pushMobileDiagnosticEvent(withLevel(event, event.level ?? 'info'));
}
