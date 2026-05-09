import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReminderBottomSheet } from '@/components/plan/ReminderBottomSheet';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { FestivalCard, festivalUi } from '@/components/ui/FestivalCard';
import { getFestivalBySlug, getFestivals, type FestivalDetail, type FestivalListItem } from '@/lib/api/festivals';
import { type MobilePlanReminderType, type MobilePlanStateDto, updateFestivalReminder } from '@/lib/api/mobilePlan';
import { formatScheduleTime, groupFestivalSchedule } from '@/lib/plan/schedule';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useTogglePlanFestivalMutation } from '@/lib/query/useTogglePlanFestivalMutation';
import { queryClient } from '@/lib/queryClient';

type PlanGroupKey = 'this_weekend' | 'this_week' | 'upcoming' | 'later' | 'past';
type PlanViewMode = 'festivals' | 'calendar';

type PlannedScheduleEntry = {
  scheduleItemId: string;
  festivalId: string;
  festivalSlug: string;
  festivalTitle: string;
  city: string;
  date: string;
  timeLabel: string;
  sortTime: number;
  stage?: string | null;
  title: string;
};

const GROUP_TITLES: Record<PlanGroupKey, string> = {
  this_weekend: 'Този уикенд',
  this_week: 'Тази седмица',
  upcoming: 'Предстои скоро',
  later: 'По-нататък',
  past: 'Минали',
};

const REMINDER_LABELS: Record<MobilePlanReminderType, string> = {
  default: 'По подразбиране',
  '24h': '24ч преди',
  same_day_09: 'В деня',
  none: 'Без напомняне',
};

const REMINDER_EXPLANATIONS: Record<MobilePlanReminderType, string> = {
  default: '24ч и около 2ч преди началото',
  '24h': 'около 24ч преди началото',
  same_day_09: 'в деня на фестивала',
  none: 'няма активно напомняне',
};

function parseDay(dateIso: string): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 86_400_000);
}

function resolveGroup(startDate: string): PlanGroupKey {
  const day = parseDay(startDate);
  if (day == null) return 'later';
  const now = new Date();
  const today = Math.floor(now.getTime() / 86_400_000);
  const delta = day - today;
  if (delta < 0) return 'past';
  const weekday = now.getDay();
  const toSaturday = (6 - weekday + 7) % 7;
  const toSunday = (7 - weekday) % 7;
  if (delta === toSaturday || delta === toSunday) return 'this_weekend';
  if (delta <= 6) return 'this_week';
  if (delta <= 30) return 'upcoming';
  return 'later';
}

function formatCalendarDateLabel(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((targetStart - todayStart) / 86_400_000);
  if (diff === 0) return 'Днес';
  if (diff === 1) return 'Утре';
  return date.toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function buildNextReminderPreview(festivals: FestivalListItem[], reminders: Record<string, { type: MobilePlanReminderType }>): string {
  const next = festivals
    .filter((festival) => (reminders[festival.festivalId]?.type ?? 'default') !== 'none')
    .sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date))[0];
  if (!next) return 'Няма активно напомняне за предстоящ фестивал.';
  const type = reminders[next.festivalId]?.type ?? 'default';
  return `${next.title}: ${REMINDER_EXPLANATIONS[type]}.`;
}

function scheduleSortTime(raw: string): number {
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60 + 999;
}

function buildPlannedScheduleEntries(
  details: FestivalDetail[],
  plannedScheduleItemIds: string[],
): PlannedScheduleEntry[] {
  const plannedSet = new Set(plannedScheduleItemIds);
  const entries: PlannedScheduleEntry[] = [];
  for (const detail of details) {
    for (const day of groupFestivalSchedule(detail)) {
      for (const item of day.items) {
        if (!plannedSet.has(item.id)) continue;
        const timeLabel = formatScheduleTime(item.start_time, item.end_time);
        entries.push({
          scheduleItemId: item.id,
          festivalId: detail.festivalId,
          festivalSlug: detail.slug,
          festivalTitle: detail.title,
          city: detail.city || 'България',
          date: day.date,
          timeLabel,
          sortTime: scheduleSortTime(timeLabel),
          stage: item.stage,
          title: item.title,
        });
      }
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.sortTime - b.sortTime);
}

function countPlannedItemsByFestival(details: FestivalDetail[], plannedScheduleItemIds: string[]): Record<string, number> {
  const plannedSet = new Set(plannedScheduleItemIds);
  const counts: Record<string, number> = {};
  for (const detail of details) {
    let count = 0;
    for (const day of groupFestivalSchedule(detail)) {
      count += day.items.filter((item) => plannedSet.has(item.id)).length;
    }
    if (count > 0) counts[detail.festivalId] = count;
  }
  return counts;
}

function PlanViewTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.viewTab, active && styles.viewTabActive, pressed && styles.viewTabPressed]}>
      <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PlannerCalendar({
  groups,
  onPressEntry,
}: {
  groups: { date: string; entries: PlannedScheduleEntry[] }[];
  onPressEntry: (entry: PlannedScheduleEntry) => void;
}) {
  if (!groups.length) {
    return (
      <View style={styles.emptyCalendar}>
        <Text style={styles.emptyCalendarTitle}>Няма избрани часове</Text>
        <Text style={styles.emptyCalendarText}>
          Отвори програма на фестивал и добави конкретни точки, за да се появят тук.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.calendarWrap}>
      {groups.map((group) => {
        const busy = group.entries.length >= 3;
        const hasConflicts = group.entries.some((entry, index) =>
          group.entries.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              Math.abs(other.sortTime - entry.sortTime) < 45 &&
              entry.sortTime < 24 * 60,
          ),
        );
        return (
          <View key={group.date} style={styles.calendarDayCard}>
            <View style={styles.calendarDayHeader}>
              <View>
                <Text style={styles.calendarDateLabel}>{formatCalendarDateLabel(group.date)}</Text>
                <Text style={styles.calendarDateSub}>
                  {busy ? 'Натоварен ден' : `${group.entries.length} планирани точки`}
                </Text>
              </View>
              <View style={[styles.busyBadge, busy && styles.busyBadgeActive]}>
                <Text style={[styles.busyBadgeText, busy && styles.busyBadgeTextActive]}>
                  {hasConflicts ? 'Конфликт' : busy ? 'Busy' : 'OK'}
                </Text>
              </View>
            </View>
            {group.entries.map((entry) => (
              <Pressable
                key={entry.scheduleItemId}
                onPress={() => onPressEntry(entry)}
                style={({ pressed }) => [styles.calendarEntry, pressed && styles.calendarEntryPressed]}>
                <View style={styles.calendarTimeRail}>
                  <Text style={styles.calendarTime}>{entry.timeLabel}</Text>
                </View>
                <View style={styles.calendarEntryBody}>
                  <Text style={styles.calendarEntryTitle} numberOfLines={2}>
                    {entry.title}
                  </Text>
                  <Text style={styles.calendarEntryMeta} numberOfLines={1}>
                    {entry.festivalTitle} · {entry.city}
                    {entry.stage ? ` · ${entry.stage}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const planQuery = useMobilePlanState();
  const togglePlanMutation = useTogglePlanFestivalMutation();
  const [pastExpanded, setPastExpanded] = useState(false);
  const [pickerFestivalId, setPickerFestivalId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PlanViewMode>('festivals');
  const festivalsQuery = useQuery({
    queryKey: ['festivals', 'plan-catalog'],
    queryFn: () => getFestivals({ sort: 'trending', limit: 240 }),
    staleTime: 60_000,
  });

  const reminderMutation = useMutation({
    mutationFn: ({ festivalId, type }: { festivalId: string; type: MobilePlanReminderType }) =>
      updateFestivalReminder(festivalId, type),
    onMutate: async ({ festivalId, type }) => {
      await queryClient.cancelQueries({ queryKey: ['mobilePlanState'] });
      const prev = queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState']);
      if (!prev) return { prev };
      queryClient.setQueryData<MobilePlanStateDto>(['mobilePlanState'], {
        ...prev,
        reminders: {
          ...prev.reminders,
          [festivalId]: { type, updated_at: new Date().toISOString() },
        },
      });
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['mobilePlanState'], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });

  const plannedFestivals = useMemo(() => {
    const idSet = new Set(planQuery.savedFestivalIds);
    const merged = (festivalsQuery.data ?? []).filter((f) => idSet.has(f.festivalId));
    return merged.sort((a, b) => {
      const aTime = Date.parse(a.start_date);
      const bTime = Date.parse(b.start_date);
      if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return a.title.localeCompare(b.title);
      return aTime - bTime;
    });
  }, [festivalsQuery.data, planQuery.savedFestivalIds]);

  const plannedDetailQueries = useQueries({
    queries: plannedFestivals.map((festival) => ({
      queryKey: ['festival', festival.slug],
      queryFn: () => getFestivalBySlug(festival.slug),
      enabled: Boolean(festival.slug),
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    })),
  });

  const hydratedDetails = useMemo(
    () =>
      plannedDetailQueries
        .map((query) => query.data)
        .filter((detail): detail is FestivalDetail => Boolean(detail)),
    [plannedDetailQueries],
  );

  const itemCountsByFestival = useMemo(
    () => countPlannedItemsByFestival(hydratedDetails, planQuery.savedScheduleItemIds),
    [hydratedDetails, planQuery.savedScheduleItemIds],
  );

  const plannedScheduleEntries = useMemo(
    () => buildPlannedScheduleEntries(hydratedDetails, planQuery.savedScheduleItemIds),
    [hydratedDetails, planQuery.savedScheduleItemIds],
  );
  const nextReminderPreview = useMemo(
    () => buildNextReminderPreview(plannedFestivals, planQuery.reminders),
    [plannedFestivals, planQuery.reminders],
  );

  const calendarGroups = useMemo(() => {
    const map = new Map<string, PlannedScheduleEntry[]>();
    for (const entry of plannedScheduleEntries) {
      map.set(entry.date, [...(map.get(entry.date) ?? []), entry]);
    }
    return Array.from(map.entries()).map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) => a.sortTime - b.sortTime),
    }));
  }, [plannedScheduleEntries]);

  const grouped = useMemo(() => {
    const groups: Record<PlanGroupKey, typeof plannedFestivals> = {
      this_weekend: [],
      this_week: [],
      upcoming: [],
      later: [],
      past: [],
    };
    for (const festival of plannedFestivals) {
      groups[resolveGroup(festival.start_date)].push({ ...festival, saved: true });
    }
    return groups;
  }, [plannedFestivals]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [grouped.this_weekend.length, grouped.this_week.length, grouped.upcoming.length, grouped.later.length, grouped.past.length]);

  const isRefreshing = festivalsQuery.isRefetching || planQuery.isRefetching;

  const onRefresh = () => {
    void Promise.all([festivalsQuery.refetch(), planQuery.refetch()]);
  };

  const openReminderPicker = (festivalId: string) => {
    setPickerFestivalId(festivalId);
  };

  if (planQuery.isPending || festivalsQuery.isPending) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator size="large" color={festivalUi.colors.text} />
      </View>
    );
  }

  if (plannedFestivals.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.center, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
        <Text style={styles.emptyTitle}>Моят план е празен</Text>
        <Text style={styles.emptySub}>Запази фестивали от Начало, за да ги виждаш тук.</Text>
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 48,
        },
      ]}>
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Моят план</Text>
        <AnimatedCount style={styles.statsLine} value={`Запазени: ${planQuery.stats.savedFestivalCount}`} />
        <AnimatedCount style={styles.statsLine} value={`Точки от програма: ${planQuery.stats.plannedItemCount}`} />
        <AnimatedCount style={styles.statsLine} value={`Предстоящи: ${planQuery.stats.upcomingCount}`} />
        <View style={styles.reminderPreviewBox}>
          <Text style={styles.reminderPreviewLabel}>Следващо напомняне</Text>
          <Text style={styles.reminderPreviewText}>{nextReminderPreview}</Text>
          <Text style={styles.reminderQuietText}>
            Тихите часове се уважават от сървъра; важните планови напомняния остават подредени според настройките ти.
          </Text>
        </View>
        <View style={styles.viewTabs}>
          <PlanViewTab label="Фестивали" active={viewMode === 'festivals'} onPress={() => setViewMode('festivals')} />
          <PlanViewTab label="Календар" active={viewMode === 'calendar'} onPress={() => setViewMode('calendar')} />
        </View>
      </View>

      {viewMode === 'calendar' ? (
        <PlannerCalendar
          groups={calendarGroups}
          onPressEntry={(entry) => router.push(`/festival/${entry.festivalSlug}`)}
        />
      ) : (
      <>
      {(['this_weekend', 'this_week', 'upcoming', 'later'] as const).map((key) =>
        grouped[key].length ? (
          <View key={key} style={styles.section}>
            <Text style={styles.sectionTitle}>{GROUP_TITLES[key]}</Text>
            {grouped[key].map((item) => {
              const reminder = planQuery.reminders[item.festivalId]?.type ?? 'default';
              const plannedItemCount = itemCountsByFestival[item.festivalId] ?? 0;
              const removing = togglePlanMutation.isPending;
              return (
                <View key={item.festivalId} style={styles.cardWrap}>
                  <FestivalCard
                    variant="compact"
                    item={item}
                    onPressCard={() => router.push(`/festival/${item.slug}`)}
                    onPressSave={() => togglePlanMutation.mutate({ festivalId: item.festivalId, slug: item.slug, festival: item })}
                    saveDisabled={removing}
                  />
                  {plannedItemCount > 0 ? (
                    <View style={styles.itemCountChip}>
                      <Text style={styles.itemCountText}>
                        {plannedItemCount === 1 ? '1 точка от програмата' : `${plannedItemCount} точки от програмата`}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.inlineActions}>
                    <Pressable onPress={() => openReminderPicker(item.festivalId)} style={styles.reminderChip}>
                      <Text style={styles.reminderChipText}>{REMINDER_LABELS[reminder]}</Text>
                    </Pressable>
                    {reminder !== 'none' ? (
                      <View style={styles.reminderActiveChip}>
                        <Text style={styles.reminderActiveText}>Активно</Text>
                      </View>
                    ) : null}
                    <Pressable onPress={() => router.push('/(tabs)/map')} style={styles.secondaryChip}>
                      <Text style={styles.secondaryChipText}>Карта</Text>
                    </Pressable>
                    {item.organizer_name ? (
                      <Pressable onPress={() => router.push(`/search?q=${encodeURIComponent(item.organizer_name ?? '')}`)} style={styles.secondaryChip}>
                        <Text style={styles.secondaryChipText}>Организатор</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => togglePlanMutation.mutate({ festivalId: item.festivalId, slug: item.slug, festival: item })}
                      style={styles.removeChip}>
                      <Text style={styles.removeChipText}>Премахни</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null,
      )}

      {grouped.past.length ? (
        <View style={styles.section}>
          <Pressable onPress={() => setPastExpanded((v) => !v)} style={styles.pastToggle}>
            <Text style={styles.sectionTitle}>{GROUP_TITLES.past}</Text>
            <Text style={styles.pastToggleText}>{pastExpanded ? 'Скрий' : `Покажи (${grouped.past.length})`}</Text>
          </Pressable>
          {pastExpanded
            ? grouped.past.map((item) => (
                <View key={item.festivalId} style={styles.cardWrap}>
                  <FestivalCard
                    variant="compact"
                    item={item}
                    onPressCard={() => router.push(`/festival/${item.slug}`)}
                    onPressSave={() => togglePlanMutation.mutate({ festivalId: item.festivalId, slug: item.slug, festival: item })}
                  />
                </View>
              ))
            : null}
        </View>
      ) : null}
      </>
      )}
    </ScrollView>
    <ReminderBottomSheet
      visible={pickerFestivalId != null}
      pending={reminderMutation.isPending}
      selectedType={pickerFestivalId ? planQuery.reminders[pickerFestivalId]?.type ?? 'default' : 'default'}
      onClose={() => setPickerFestivalId(null)}
      onSelect={(type) => {
        const targetId = pickerFestivalId;
        if (!targetId) return;
        reminderMutation.mutate({ festivalId: targetId, type }, { onSettled: () => setPickerFestivalId(null) });
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: festivalUi.screenPadding, gap: 14 },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyTitle: { fontSize: 23, fontWeight: '800', color: festivalUi.colors.text, textAlign: 'center' },
  emptySub: { marginTop: 10, fontSize: 15, color: festivalUi.colors.secondary, textAlign: 'center' },
  statsCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  statsTitle: { fontSize: 20, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 8 },
  statsLine: { fontSize: 14, color: festivalUi.colors.secondary, fontWeight: '600' },
  reminderPreviewBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#EEF2FF',
    padding: 10,
  },
  reminderPreviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3730A3',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reminderPreviewText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 18,
  },
  reminderQuietText: {
    marginTop: 5,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
  },
  viewTabs: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    padding: 4,
  },
  viewTab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    paddingVertical: 8,
  },
  viewTabActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewTabPressed: {
    opacity: 0.78,
  },
  viewTabText: {
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.secondary,
  },
  viewTabTextActive: {
    color: festivalUi.colors.text,
  },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 8 },
  cardWrap: { marginBottom: 12 },
  itemCountChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  emptyCalendar: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 18,
    alignItems: 'center',
  },
  emptyCalendarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  emptyCalendarText: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
  },
  calendarWrap: {
    gap: 12,
  },
  calendarDayCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  calendarDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  calendarDateLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  calendarDateSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
  },
  busyBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  busyBadgeActive: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  busyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
  },
  busyBadgeTextActive: {
    color: '#92400E',
  },
  calendarEntry: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    paddingBottom: 8,
  },
  calendarEntryPressed: {
    opacity: 0.75,
  },
  calendarTimeRail: {
    width: 74,
  },
  calendarTime: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
  },
  calendarEntryBody: {
    flex: 1,
    minWidth: 0,
  },
  calendarEntryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 19,
  },
  calendarEntryMeta: {
    marginTop: 4,
    fontSize: 12,
    color: festivalUi.colors.secondary,
  },
  inlineActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  reminderChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  reminderChipText: { fontSize: 12, fontWeight: '700', color: festivalUi.colors.text },
  reminderActiveChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  reminderActiveText: { fontSize: 12, fontWeight: '800', color: '#166534' },
  secondaryChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  secondaryChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  removeChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  removeChipText: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
  pastToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastToggleText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
});
