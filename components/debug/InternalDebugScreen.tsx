import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi } from '@/components/ui/FestivalCard';
import { buildMobileDiagnosticsExport } from '@/lib/debug/mobileDiagnosticsExport';
import {
  clearMobileDiagnosticEvents,
  getMobileDiagnosticEvents,
  getMobileDiagnosticStats,
  type MobileDiagnosticEvent,
} from '@/lib/debug/mobileDiagnosticsStore';

type FilterId = 'planner' | 'recommendations' | 'queue' | 'critical';
type CollapsedEvent = {
  event: MobileDiagnosticEvent;
  count: number;
};

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'planner', label: 'Planner' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'queue', label: 'Queue' },
  { id: 'critical', label: 'Warnings/errors' },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function applyFilters(events: MobileDiagnosticEvent[], activeFilters: Set<FilterId>): MobileDiagnosticEvent[] {
  const scopeFilters = FILTERS.map((filter) => filter.id).filter(
    (id): id is Exclude<FilterId, 'critical'> => id !== 'critical' && activeFilters.has(id),
  );
  return events.filter((event) => {
    if (activeFilters.has('critical') && event.level === 'info') return false;
    if (scopeFilters.length > 0 && !scopeFilters.includes(event.scope as Exclude<FilterId, 'critical'>)) {
      return false;
    }
    return true;
  });
}

function collapseRepeatedInfoEvents(events: MobileDiagnosticEvent[]): CollapsedEvent[] {
  const rows: CollapsedEvent[] = [];
  for (const event of events) {
    const previous = rows[rows.length - 1];
    const signature = `${event.type}|${event.scope}|${event.message}|${JSON.stringify(event.meta ?? {})}`;
    const previousSignature = previous
      ? `${previous.event.type}|${previous.event.scope}|${previous.event.message}|${JSON.stringify(previous.event.meta ?? {})}`
      : null;
    if (event.level === 'info' && previous?.event.level === 'info' && signature === previousSignature) {
      previous.count += 1;
    } else {
      rows.push({ event, count: 1 });
    }
  }
  return rows;
}

export function InternalDebugScreen() {
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState(() => getMobileDiagnosticEvents());
  const [stats, setStats] = useState(() => getMobileDiagnosticStats());
  const [activeFilters, setActiveFilters] = useState<Set<FilterId>>(() => new Set(['critical']));
  const [copied, setCopied] = useState(false);

  const latestEvents = useMemo(
    () => collapseRepeatedInfoEvents(applyFilters(events, activeFilters).slice(0, 100)),
    [activeFilters, events],
  );

  const refresh = () => {
    setEvents(getMobileDiagnosticEvents());
    setStats(getMobileDiagnosticStats());
  };

  const toggleFilter = (id: FilterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearEvents = () => {
    clearMobileDiagnosticEvents();
    setCopied(false);
    refresh();
  };

  const copyExport = async () => {
    await Clipboard.setStringAsync(buildMobileDiagnosticsExport());
    setCopied(true);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Internal Diagnostics</Text>
        <Text style={styles.subtitle}>Planner, queue, hydration, and recommendation events.</Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.warnings}</Text>
          <Text style={styles.statLabel}>Warnings</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.errors}</Text>
          <Text style={styles.statLabel}>Errors</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} onPress={copyExport}>
          <Text style={styles.actionButtonText}>{copied ? 'Copied JSON' : 'Copy JSON'}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={clearEvents}>
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={refresh}>
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((filter) => {
          const active = activeFilters.has(filter.id);
          return (
            <Pressable
              key={filter.id}
              style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressed]}
              onPress={() => toggleFilter(filter.id)}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.eventsHeader}>
        <Text style={styles.sectionTitle}>Latest Events</Text>
        <Text style={styles.countText}>{latestEvents.length}/100 rows shown</Text>
      </View>

      {latestEvents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No diagnostics events match the current filters.</Text>
        </View>
      ) : (
        latestEvents.map(({ event, count }) => (
          <View
            key={`${event.ts}:${event.type}:${event.message}`}
            style={[styles.eventCard, event.level === 'error' && styles.errorCard, event.level === 'warn' && styles.warnCard]}>
            <View style={styles.eventTopRow}>
              <View style={styles.eventPills}>
                <Text style={[styles.levelPill, event.level === 'error' && styles.errorPill, event.level === 'warn' && styles.warnPill]}>
                  {event.level.toUpperCase()}
                </Text>
                {count > 1 ? (
                  <Text style={styles.countPill}>{count}x</Text>
                ) : null}
              </View>
              <Text style={styles.eventTime}>{formatTime(event.ts)}</Text>
            </View>
            <Text style={styles.eventType}>{event.type}</Text>
            <Text style={styles.eventMessage}>{event.message}</Text>
            <Text style={styles.eventScope}>{event.scope}</Text>
            {event.meta ? <Text style={styles.eventMeta}>{JSON.stringify(event.meta)}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F4F5F8',
  },
  content: {
    paddingHorizontal: festivalUi.screenPadding,
    gap: 14,
  },
  header: {
    gap: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: festivalUi.colors.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: festivalUi.colors.secondary,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
    gap: 12,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: festivalUi.colors.secondary,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: festivalUi.colors.text,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
  },
  secondaryButtonText: {
    color: festivalUi.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
  },
  filterChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
  },
  filterChipTextActive: {
    color: '#3730A3',
  },
  eventsHeader: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  countText: {
    fontSize: 12,
    color: festivalUi.colors.secondary,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
  },
  emptyText: {
    color: festivalUi.colors.secondary,
    fontSize: 14,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 14,
    gap: 5,
  },
  warnCard: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  errorCard: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E0E7FF',
    color: '#3730A3',
    fontSize: 10,
    fontWeight: '800',
  },
  warnPill: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
  },
  errorPill: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },
  countPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#F3F4F6',
    color: festivalUi.colors.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  eventTime: {
    color: festivalUi.colors.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  eventType: {
    marginTop: 4,
    color: festivalUi.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  eventMessage: {
    color: festivalUi.colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  eventScope: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  eventMeta: {
    marginTop: 4,
    color: festivalUi.colors.secondary,
    fontSize: 11,
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.75,
  },
});
