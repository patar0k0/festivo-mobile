import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  getMobileDiagnosticEvents,
  getMobileDiagnosticStats,
  type MobileDiagnosticEvent,
} from '@/lib/debug/mobileDiagnosticsStore';

const MAX_EXPORTED_EVENTS = 200;

function getAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    (Constants.nativeAppVersion as string | undefined) ??
    'unknown'
  );
}

export type MobileDiagnosticsExport = {
  exportedAt: string;
  platform: {
    os: typeof Platform.OS;
    version: string | number;
  };
  appVersion: string;
  stats: ReturnType<typeof getMobileDiagnosticStats>;
  events: MobileDiagnosticEvent[];
};

export function buildMobileDiagnosticsExport(maxEvents = MAX_EXPORTED_EVENTS): string {
  const cappedMaxEvents = Math.max(0, Math.min(MAX_EXPORTED_EVENTS, Math.floor(maxEvents)));
  const blob: MobileDiagnosticsExport = {
    exportedAt: new Date().toISOString(),
    platform: {
      os: Platform.OS,
      version: Platform.Version,
    },
    appVersion: getAppVersion(),
    stats: getMobileDiagnosticStats(),
    events: getMobileDiagnosticEvents().slice(0, cappedMaxEvents),
  };

  return JSON.stringify(blob);
}
