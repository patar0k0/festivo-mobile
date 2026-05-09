import { useMutation, useQuery } from '@tanstack/react-query';
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
import { getFestivals } from '@/lib/api/festivals';
import { type MobilePlanReminderType, type MobilePlanStateDto, updateFestivalReminder } from '@/lib/api/mobilePlan';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useTogglePlanFestivalMutation } from '@/lib/query/useTogglePlanFestivalMutation';
import { queryClient } from '@/lib/queryClient';

type PlanGroupKey = 'this_weekend' | 'this_week' | 'upcoming' | 'later' | 'past';

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

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const planQuery = useMobilePlanState();
  const togglePlanMutation = useTogglePlanFestivalMutation();
  const [pastExpanded, setPastExpanded] = useState(false);
  const [pickerFestivalId, setPickerFestivalId] = useState<string | null>(null);
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
        <AnimatedCount style={styles.statsLine} value={`Предстоящи: ${planQuery.stats.upcomingCount}`} />
      </View>

      {(['this_weekend', 'this_week', 'upcoming', 'later'] as const).map((key) =>
        grouped[key].length ? (
          <View key={key} style={styles.section}>
            <Text style={styles.sectionTitle}>{GROUP_TITLES[key]}</Text>
            {grouped[key].map((item) => {
              const reminder = planQuery.reminders[item.festivalId]?.type ?? 'default';
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
                  <View style={styles.inlineActions}>
                    <Pressable onPress={() => openReminderPicker(item.festivalId)} style={styles.reminderChip}>
                      <Text style={styles.reminderChipText}>{REMINDER_LABELS[reminder]}</Text>
                    </Pressable>
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
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 8 },
  cardWrap: { marginBottom: 12 },
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
