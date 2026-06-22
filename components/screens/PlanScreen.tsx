import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlannerCalendar, formatCalendarDateLabel } from '@/components/plan/PlannerCalendar';
import type { PlannedScheduleEntry } from '@/components/plan/PlannerCalendar';
import { PlannedFestivalRow } from '@/components/plan/PlannedFestivalRow';
import { ReminderBottomSheet } from '@/components/plan/ReminderBottomSheet';
import { StatTile } from '@/components/plan/StatTile';
import { FestivalCard, festivalUi } from '@/components/ui/FestivalCard';
import { getStartsInLabelBg } from '@/lib/festival/relativeDate';
import {
  getFestivalBySlug,
  type FestivalDetail,
  type FestivalListItem,
  type FestivalScheduleItem,
} from '@/lib/api/festivals';
import {
  setScheduleItemInPlan,
  type MobilePlanReminderType,
  type SavedFestivalBasicDto,
} from '@/lib/api/mobilePlan';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { formatScheduleTime, getFestivalScheduleTimeZone, groupFestivalSchedule } from '@/lib/plan/schedule';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useTogglePlanFestivalMutation } from '@/lib/query/useTogglePlanFestivalMutation';
import { useUpdatePlanReminderMutation } from '@/lib/query/useUpdatePlanReminderMutation';

if (
  Platform.OS === 'android' &&
  (global as typeof globalThis & { nativeFabricUIManager?: unknown }).nativeFabricUIManager == null
) {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type PlanGroupKey = 'this_weekend' | 'this_week' | 'upcoming' | 'later' | 'past';
type PlanViewMode = 'festivals' | 'calendar';

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

function resolveGroup(startDate: string, endDate?: string | null): PlanGroupKey {
  const startDay = parseDay(startDate);
  const endDay = endDate ? parseDay(endDate) : null;
  const now = new Date();
  const today = Math.floor(now.getTime() / 86_400_000);
  const lastDay = endDay ?? startDay;
  if (lastDay == null || lastDay < today) return 'past';
  if (startDay == null) return 'later';
  if (startDay < today) return 'this_week';
  const delta = startDay - today;
  const weekday = now.getDay();
  const toSaturday = (6 - weekday + 7) % 7;
  const toSunday = (7 - weekday) % 7;
  if (delta === toSaturday || delta === toSunday) return 'this_weekend';
  if (delta <= 6) return 'this_week';
  if (delta <= 30) return 'upcoming';
  return 'later';
}

function buildNextReminderPreview(
  festivals: FestivalListItem[],
  reminders: Record<string, { type: MobilePlanReminderType }>,
): string {
  const today = Math.floor(Date.now() / 86_400_000);
  const isUpcoming = (festival: FestivalListItem) => {
    const lastDay = parseDay(festival.end_date || festival.start_date);
    return lastDay != null && lastDay >= today;
  };
  const next = festivals
    .filter((festival) => isUpcoming(festival))
    .filter((festival) => (reminders[festival.festivalId]?.type ?? 'default') !== 'none')
    .sort((a, b) => {
      const ta = Date.parse(a.start_date) || Infinity;
      const tb = Date.parse(b.start_date) || Infinity;
      return ta - tb;
    })[0];
  if (!next) return 'Няма активно напомняне за предстоящ фестивал.';
  const type = reminders[next.festivalId]?.type ?? 'default';
  const startsIn = getStartsInLabelBg(next.start_date);
  return `Следващо напомняне — ${REMINDER_EXPLANATIONS[type]} · ${startsIn.toLowerCase()}.`;
}

function scheduleSortTime(raw: string): number {
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60 + 999;
}

function todayYmdLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function itemSortKey(detail: FestivalDetail, item: FestivalScheduleItem): number {
  if (item.starts_at?.includes('T')) {
    const ms = Date.parse(item.starts_at);
    if (Number.isFinite(ms)) return ms;
  }
  const tz = getFestivalScheduleTimeZone(detail);
  const label = formatScheduleTime(item.starts_at ?? item.start_time, item.ends_at ?? item.end_time, tz);
  return scheduleSortTime(label);
}

function firstPlannedDayYmd(entries: PlannedScheduleEntry[], festivalId: string): string | undefined {
  const row = entries.find((e) => e.festivalId === festivalId);
  return row ? row.date.slice(0, 10) : undefined;
}

function buildPlannedScheduleEntries(
  details: FestivalDetail[],
  plannedScheduleItemIds: string[],
): PlannedScheduleEntry[] {
  const plannedSet = new Set(plannedScheduleItemIds);
  const entries: PlannedScheduleEntry[] = [];
  for (const detail of details) {
    const tz = getFestivalScheduleTimeZone(detail);
    for (const day of groupFestivalSchedule(detail)) {
      for (const item of day.items) {
        if (!plannedSet.has(item.id)) continue;
        const timeLabel = formatScheduleTime(
          item.starts_at ?? item.start_time,
          item.ends_at ?? item.end_time,
          tz,
        );
        const sortKey = itemSortKey(detail, item);
        entries.push({
          scheduleItemId: item.id,
          festivalId: detail.festivalId,
          festivalSlug: detail.slug,
          festivalTitle: detail.title,
          city: detail.city || 'България',
          date: day.date,
          timeLabel,
          sortTime: scheduleSortTime(timeLabel),
          sortKey,
          stage: item.stage ?? item.venue,
          title: item.title,
        });
      }
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.sortKey - b.sortKey);
}

function countPlannedItemsByFestival(
  details: FestivalDetail[],
  plannedScheduleItemIds: string[],
): Record<string, number> {
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
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.viewTab, active && styles.viewTabActive, pressed && styles.viewTabPressed]}>
      <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const planQuery = useMobilePlanState();
  const togglePlanMutation = useTogglePlanFestivalMutation();
  const queryClient = useQueryClient();
  const [pastExpanded, setPastExpanded] = useState(false);
  const [pickerFestivalId, setPickerFestivalId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PlanViewMode>('festivals');
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const reminderMutation = useUpdatePlanReminderMutation();

  const plannedFestivals = useMemo((): FestivalListItem[] => {
    return planQuery.savedFestivals.map((f: SavedFestivalBasicDto) => ({
      festivalId: f.festivalId,
      slug: f.slug,
      title: f.title,
      city: f.city ?? '',
      start_date: f.start_date ?? '',
      end_date: f.end_date ?? '',
      image_url: f.image_url,
      saved: true,
      organizer_name: f.organizer_name ?? undefined,
      organizer: f.organizer,
      category: f.category ?? undefined,
      is_verified: f.is_verified,
      is_promoted: false,
    }));
  }, [planQuery.savedFestivals]);

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

  const orphanedScheduleItemIds = useMemo(() => {
    if (planQuery.savedScheduleItemIds.length === 0) return [] as string[];
    const anyLoading = plannedDetailQueries.some((q) => q.isPending || q.isFetching);
    if (anyLoading) return [] as string[];
    const liveIds = new Set(hydratedDetails.flatMap((d) => (d.schedule_items ?? []).map((i) => i.id)));
    return planQuery.savedScheduleItemIds.filter((id) => !liveIds.has(id));
  }, [hydratedDetails, plannedDetailQueries, planQuery.savedScheduleItemIds]);

  const handleCleanupOrphans = async () => {
    if (cleaningOrphans || orphanedScheduleItemIds.length === 0) return;
    setCleaningOrphans(true);
    try {
      for (const id of orphanedScheduleItemIds) {
        try {
          await setScheduleItemInPlan(id, false);
        } catch (err) {
          if (__DEV__) console.warn('[plan][cleanup orphan failed]', { id, err });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    } finally {
      setCleaningOrphans(false);
    }
  };

  useEffect(() => {
    if (!__DEV__) return;
    const savedIds = planQuery.savedScheduleItemIds;
    if (savedIds.length === 0) return;
    if (plannedScheduleEntries.length === savedIds.length) return;
    const anyLoading = plannedDetailQueries.some((q) => q.isPending || q.isFetching);
    if (anyLoading) return;
    const detailItemIds = hydratedDetails.flatMap((d) => (d.schedule_items ?? []).map((i) => i.id));
    const missing = savedIds.filter((id) => !detailItemIds.includes(id));
    console.warn('[plan][schedule mismatch]', {
      savedItemCount: savedIds.length,
      resolvedEntryCount: plannedScheduleEntries.length,
      hydratedFestivalCount: hydratedDetails.length,
      detailItemTotalCount: detailItemIds.length,
      missingFromDetail: missing.slice(0, 5),
      savedItemIdsHead: savedIds.slice(0, 5),
    });
  }, [hydratedDetails, plannedDetailQueries, plannedScheduleEntries.length, planQuery.savedScheduleItemIds]);

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
      entries: entries.sort((a, b) => a.sortKey - b.sortKey),
    }));
  }, [plannedScheduleEntries]);

  const todaysPlanEntries = useMemo(() => {
    const ymd = todayYmdLocal();
    return plannedScheduleEntries.filter((e) => e.date.slice(0, 10) === ymd).slice(0, 10);
  }, [plannedScheduleEntries]);

  const upcomingPlanPreview = useMemo(() => {
    const ymd = todayYmdLocal();
    return plannedScheduleEntries.filter((e) => e.date.slice(0, 10) > ymd).slice(0, 6);
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
      groups[resolveGroup(festival.start_date, festival.end_date)].push({ ...festival, saved: true });
    }
    return groups;
  }, [plannedFestivals]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [grouped.this_weekend.length, grouped.this_week.length, grouped.upcoming.length, grouped.later.length, grouped.past.length]);

  const isRefreshing = planQuery.isRefetching;
  const onRefresh = () => { void planQuery.refetch(); };
  const openReminderPicker = (festivalId: string) => { setPickerFestivalId(festivalId); };

  if (planQuery.isPending) {
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
        <Text style={styles.emptySub}>Добави фестивали в плана от Начало, за да ги виждаш тук.</Text>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 },
        ]}>
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Моят план</Text>
          <View style={styles.statTilesRow}>
            <StatTile value={planQuery.stats.savedFestivalCount} label="В плана" icon="bookmark" tone="indigo" delay={0} />
            <View style={styles.statTilesDivider} />
            <StatTile value={planQuery.stats.plannedItemCount} label="Точки" icon="checkmark-circle" tone="amber" delay={60} />
            <View style={styles.statTilesDivider} />
            <StatTile value={planQuery.stats.upcomingCount} label="Предстоящи" icon="time" tone="emerald" delay={120} />
          </View>
          <View style={styles.reminderPreviewLine}>
            <Text style={styles.reminderPreviewLineIcon}>⏰</Text>
            <Text style={styles.reminderPreviewLineText} numberOfLines={2}>{nextReminderPreview}</Text>
          </View>
          <View style={styles.viewTabs}>
            <PlanViewTab label="Фестивали" active={viewMode === 'festivals'} onPress={() => setViewMode('festivals')} />
            <PlanViewTab label="Програма" active={viewMode === 'calendar'} onPress={() => setViewMode('calendar')} />
          </View>
        </View>

        {viewMode === 'festivals' && todaysPlanEntries.length > 0 ? (
          <View style={styles.previewSection}>
            <Text style={styles.sectionTitle}>Днес</Text>
            <View style={styles.previewCard}>
              {todaysPlanEntries.map((entry, index) => (
                <Pressable
                  key={entry.scheduleItemId}
                  onPress={() => router.push(festivalDetailHref(entry.festivalSlug, { scheduleDay: entry.date.slice(0, 10) }))}
                  style={({ pressed }) => [
                    styles.previewRow,
                    index === 0 && styles.previewRowFirst,
                    pressed && styles.previewRowPressed,
                  ]}>
                  <Text style={styles.previewTime}>{entry.timeLabel}</Text>
                  <View style={styles.previewBody}>
                    <Text style={styles.previewTitle} numberOfLines={2}>{entry.title}</Text>
                    <Text style={styles.previewMeta} numberOfLines={1}>{entry.festivalTitle} · {entry.city}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {viewMode === 'festivals' && upcomingPlanPreview.length > 0 ? (
          <View style={styles.previewSection}>
            <Text style={styles.sectionTitle}>Следващи в плана</Text>
            <View style={styles.previewCard}>
              {upcomingPlanPreview.map((entry, index) => (
                <Pressable
                  key={`${entry.scheduleItemId}-up`}
                  onPress={() => router.push(festivalDetailHref(entry.festivalSlug, { scheduleDay: entry.date.slice(0, 10) }))}
                  style={({ pressed }) => [
                    styles.previewRow,
                    index === 0 && styles.previewRowFirst,
                    pressed && styles.previewRowPressed,
                  ]}>
                  <Text style={styles.previewTime}>{formatCalendarDateLabel(entry.date)}</Text>
                  <View style={styles.previewBody}>
                    <Text style={styles.previewTitle} numberOfLines={2}>{entry.title}</Text>
                    <Text style={styles.previewMeta} numberOfLines={1}>{entry.timeLabel} · {entry.festivalTitle}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {viewMode === 'calendar' ? (
          <PlannerCalendar
            groups={calendarGroups}
            loading={plannedDetailQueries.some((q) => q.isPending || q.isFetching)}
            hasSavedItems={planQuery.savedScheduleItemIds.length > 0}
            orphanedCount={orphanedScheduleItemIds.length}
            onCleanupOrphans={() => void handleCleanupOrphans()}
            cleaningUp={cleaningOrphans}
            onPressEntry={(entry) => router.push(festivalDetailHref(entry.festivalSlug))}
          />
        ) : (
          <>
            {(['this_weekend', 'this_week', 'upcoming', 'later'] as const).map((key) =>
              grouped[key].length ? (
                <View key={key} style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>{GROUP_TITLES[key]}</Text>
                    <View style={styles.sectionCountBadge}>
                      <Text style={styles.sectionCountText}>{grouped[key].length}</Text>
                    </View>
                  </View>
                  {grouped[key].map((item) => {
                    const reminder = planQuery.reminders[item.festivalId]?.type ?? 'default';
                    const plannedItemCount = itemCountsByFestival[item.festivalId] ?? 0;
                    const removing = removingIds.has(item.festivalId);
                    const onRemove = () => {
                      setRemovingIds((prev) => new Set(prev).add(item.festivalId));
                      togglePlanMutation.mutate(
                        { festivalId: item.festivalId, slug: item.slug, festival: item },
                        {
                          onSettled: () =>
                            setRemovingIds((prev) => {
                              const next = new Set(prev);
                              next.delete(item.festivalId);
                              return next;
                            }),
                        },
                      );
                    };
                    return (
                      <View key={item.festivalId} style={styles.cardWrap}>
                        <PlannedFestivalRow
                          item={item}
                          reminder={reminder}
                          reminderLabel={REMINDER_LABELS[reminder]}
                          plannedItemCount={plannedItemCount}
                          removing={removing}
                          hasOrganizer={Boolean(item.organizer_name)}
                          onPressCard={() => router.push(festivalDetailHref(item.slug))}
                          onPressProgram={() => {
                            const day = firstPlannedDayYmd(plannedScheduleEntries, item.festivalId);
                            router.push(
                              day
                                ? festivalDetailHref(item.slug, { scheduleDay: day })
                                : festivalDetailHref(item.slug),
                            );
                          }}
                          onPressReminder={() => openReminderPicker(item.festivalId)}
                          onPressMap={() => router.push('/(tabs)/map')}
                          onPressOrganizer={() => {
                            const orgSlug = item.organizer?.slug?.trim();
                            if (orgSlug) {
                              router.push(`/organizer/${orgSlug}`);
                            } else if (item.organizer_name) {
                              router.push(`/search?q=${encodeURIComponent(item.organizer_name)}`);
                            }
                          }}
                          onPressRemove={onRemove}
                        />
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
                          onPressCard={() => router.push(festivalDetailHref(item.slug))}
                          onPressSave={() =>
                            togglePlanMutation.mutate({ festivalId: item.festivalId, slug: item.slug, festival: item })
                          }
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
          void Haptics.impactAsync(
            type === 'none' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
          );
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
  statsTitle: { fontSize: 20, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 10 },
  statTilesRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 4 },
  statTilesDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 6 },
  reminderPreviewLine: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  reminderPreviewLineIcon: { fontSize: 14, lineHeight: 18 },
  reminderPreviewLineText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: festivalUi.colors.text,
    lineHeight: 18,
  },
  viewTabs: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    padding: 4,
  },
  viewTab: { flex: 1, alignItems: 'center', borderRadius: 9, paddingVertical: 8 },
  viewTabActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  viewTabPressed: { opacity: 0.78 },
  viewTabText: { fontSize: 13, fontWeight: '800', color: festivalUi.colors.secondary },
  viewTabTextActive: { color: festivalUi.colors.text },
  previewSection: { gap: 8 },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
  },
  previewRowFirst: {
    borderTopWidth: 0,
    backgroundColor: '#FAFAFF',
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
    paddingVertical: 11,
  },
  previewRowPressed: { opacity: 0.82 },
  previewTime: { width: 56, fontSize: 12, fontWeight: '800', color: '#4F46E5', paddingTop: 2 },
  previewBody: { flex: 1, minWidth: 0 },
  previewTitle: { fontSize: 15, fontWeight: '800', color: festivalUi.colors.text, lineHeight: 19 },
  previewMeta: { marginTop: 4, fontSize: 12, color: festivalUi.colors.secondary },
  section: { marginTop: 16, gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 8, letterSpacing: -0.3 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    marginBottom: 6,
  },
  sectionCountText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  cardWrap: { marginBottom: 12 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastToggleText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
});
