import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type ListRenderItem,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalDetail, FestivalScheduleItem } from '@/lib/api/festivals';
import {
  findScheduleSectionIndexForDate,
  formatScheduleTime,
  getFestivalScheduleTimeZone,
  groupFestivalSchedule,
  pickInitialScheduleDayIndex,
} from '@/lib/plan/schedule';
import { isSyntheticPlannerScheduleItemId } from '@/lib/plan/scheduleItemId';
import type { ReactElement } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

type ToggleArgs = { scheduleItemId: string; desiredInPlan: boolean };

type Props = {
  detail: FestivalDetail;
  listHeader: ReactElement;
  listFooter: ReactElement;
  contentContainerBottom: number;
  initialScheduleDay?: string;
  isScheduleItemPlanned: (scheduleItemId: string) => boolean;
  toggleScheduleItemMutation: UseMutationResult<
    { ok: boolean; inPlan: boolean; scheduleItemId: string },
    Error,
    ToggleArgs,
    unknown
  >;
};

const TimelineRow = memo(function TimelineRow({
  item,
  timeZone,
  planned,
  pending,
  synthetic,
  onToggle,
}: {
  item: FestivalScheduleItem;
  timeZone: string;
  planned: boolean;
  pending: boolean;
  synthetic: boolean;
  onToggle: () => void;
}) {
  const venue = item.venue ?? item.stage;
  return (
    <View style={[styles.timelineCard, planned && styles.timelineCardPlanned]}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, planned && styles.timelineDotPlanned]} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.timelineCardBody}>
        <Text style={styles.timelineMeta} numberOfLines={1}>
          {formatScheduleTime(item.starts_at ?? item.start_time, item.ends_at ?? item.end_time, timeZone)}
          {venue ? ` · ${venue}` : ''}
        </Text>
        <Text style={styles.timelineTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.timelineDescription} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Pressable
        disabled={pending || synthetic}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.timelinePlanButton,
          planned && styles.timelinePlanButtonActive,
          (pressed || pending) && styles.timelinePlanButtonPressed,
          synthetic && styles.timelinePlanButtonDisabled,
        ]}>
        {pending ? (
          <ActivityIndicator size="small" color={planned ? '#FFFFFF' : festivalUi.colors.text} />
        ) : synthetic ? (
          <Text style={styles.timelinePlanTextMuted}>—</Text>
        ) : (
          <>
            <Ionicons
              name={planned ? 'checkmark' : 'add'}
              size={17}
              color={planned ? '#FFFFFF' : festivalUi.colors.text}
            />
            <Text style={[styles.timelinePlanText, planned && styles.timelinePlanTextActive]}>
              {planned ? 'В плана' : 'План'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
});

export const FestivalScheduleSectionList = memo(function FestivalScheduleSectionList({
  detail,
  listHeader,
  listFooter,
  contentContainerBottom,
  initialScheduleDay,
  isScheduleItemPlanned,
  toggleScheduleItemMutation,
}: Props) {
  const listRef = useRef<SectionList<FestivalScheduleItem>>(null);
  const groupedDays = useMemo(() => groupFestivalSchedule(detail), [detail]);
  const timeZone = useMemo(() => getFestivalScheduleTimeZone(detail), [detail]);
  const initialDayIndex = useMemo(() => pickInitialScheduleDayIndex(groupedDays), [groupedDays]);
  const [activeDayIndex, setActiveDayIndex] = useState(initialDayIndex);
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setActiveDayIndex(initialDayIndex);
  }, [initialDayIndex, detail.slug]);

  const sections = useMemo(
    () =>
      groupedDays.map((day) => ({
        title: day.label,
        date: day.date,
        dayId: day.id,
        data: day.items,
      })),
    [groupedDays],
  );

  const plannedInFestival = useMemo(() => {
    if (!groupedDays.length) return 0;
    return groupedDays.reduce(
      (count, day) => count + day.items.filter((it) => isScheduleItemPlanned(it.id)).length,
      0,
    );
  }, [groupedDays, isScheduleItemPlanned]);

  const scrollToSection = useCallback((index: number) => {
    const i = Math.max(0, Math.min(index, Math.max(0, sections.length - 1)));
    listRef.current?.scrollToLocation({
      sectionIndex: i,
      itemIndex: 0,
      animated: true,
      viewOffset: 6,
    });
  }, [sections.length]);

  useEffect(() => {
    if (!sections.length) return;
    const fromParam = findScheduleSectionIndexForDate(groupedDays, initialScheduleDay);
    const idx = fromParam ?? pickInitialScheduleDayIndex(groupedDays);
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToLocation({
        sectionIndex: idx,
        itemIndex: 0,
        animated: false,
        viewOffset: 4,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [detail.slug, groupedDays, initialScheduleDay, sections.length]);

  const renderItem: ListRenderItem<FestivalScheduleItem> = useCallback(
    ({ item }) => {
      const planned = isScheduleItemPlanned(item.id);
      const pending = pendingItemIds.has(item.id);
      const synthetic = isSyntheticPlannerScheduleItemId(item.id);
      return (
        <TimelineRow
          item={item}
          timeZone={timeZone}
          planned={planned}
          pending={pending}
          synthetic={synthetic}
          onToggle={() => {
            if (synthetic) return;
            setPendingItemIds((prev) => new Set(prev).add(item.id));
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleScheduleItemMutation.mutate(
              { scheduleItemId: item.id, desiredInPlan: !planned },
              {
                onSettled: () => {
                  setPendingItemIds((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                },
              },
            );
          }}
        />
      );
    },
    [pendingItemIds, isScheduleItemPlanned, timeZone, toggleScheduleItemMutation],
  );

  const keyExtractor = useCallback((item: FestivalScheduleItem) => item.id, []);

  if (!sections.length) return null;

  return (
    <SectionList
      ref={listRef}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText} numberOfLines={1}>
            {section.title}
          </Text>
        </View>
      )}
      ListHeaderComponent={
        <Reanimated.View entering={FadeInDown.duration(220).delay(40)}>
          {listHeader}
          <View style={styles.scheduleSection}>
            <View style={styles.scheduleHeaderRow}>
              <View>
                <Text style={styles.sectionHeading}>Програма</Text>
                <Text style={styles.scheduleHint}>
                  {plannedInFestival > 0
                    ? `${plannedInFestival} точки са в плана ти`
                    : 'Добавяй отделни точки към личния си план.'}
                </Text>
              </View>
              <View style={styles.scheduleCountPill}>
                <Ionicons name="list-outline" size={14} color="#4F46E5" />
                <Text style={styles.scheduleCountText}>{detail.schedule_items?.length ?? 0}</Text>
              </View>
            </View>
            <View style={styles.dayChipRow}>
              {groupedDays.map((day, index) => {
                const active = index === activeDayIndex;
                const plannedCount = day.items.filter((it) => isScheduleItemPlanned(it.id)).length;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => {
                      setActiveDayIndex(index);
                      scrollToSection(index);
                      void Haptics.selectionAsync();
                    }}
                    style={({ pressed }) => [
                      styles.dayChip,
                      active && styles.dayChipActive,
                      pressed && styles.dayChipPressed,
                    ]}>
                    <Text style={[styles.dayChipText, active && styles.dayChipTextActive]} numberOfLines={1}>
                      {day.label}
                    </Text>
                    {plannedCount > 0 ? (
                      <View style={styles.dayPlannedDot}>
                        <Text style={styles.dayPlannedText}>{plannedCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Reanimated.View>
      }
      ListFooterComponent={listFooter}
      contentContainerStyle={[styles.sectionListContent, { paddingBottom: contentContainerBottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews
      maxToRenderPerBatch={12}
      windowSize={7}
      initialNumToRender={10}
    />
  );
});

const styles = StyleSheet.create({
  sectionListContent: {
    flexGrow: 1,
  },
  scheduleSection: {
    marginHorizontal: festivalUi.screenPadding,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleHint: {
    marginTop: 4,
    fontSize: 13,
    color: festivalUi.colors.secondary,
    lineHeight: 18,
  },
  scheduleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scheduleCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  dayChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  dayChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dayChipActive: {
    borderColor: festivalUi.colors.text,
    backgroundColor: festivalUi.colors.text,
  },
  dayChipPressed: {
    opacity: 0.78,
  },
  dayChipText: {
    maxWidth: 160,
    fontSize: 13,
    fontWeight: '700',
    color: festivalUi.colors.text,
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  dayPlannedDot: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
  },
  dayPlannedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  sectionHeader: {
    backgroundColor: '#F9FAFB',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    paddingHorizontal: festivalUi.screenPadding,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: festivalUi.colors.text,
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: festivalUi.screenPadding,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingRight: 10,
  },
  timelineCardPlanned: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  timelineRail: {
    width: 30,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginTop: 5,
  },
  timelineDotPlanned: {
    backgroundColor: '#16A34A',
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginTop: 5,
  },
  timelineCardBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  timelineMeta: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
  },
  timelineTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 20,
  },
  timelineDescription: {
    marginTop: 5,
    fontSize: 13,
    color: festivalUi.colors.secondary,
    lineHeight: 18,
  },
  timelinePlanButton: {
    minWidth: 70,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  timelinePlanButtonActive: {
    borderColor: '#16A34A',
    backgroundColor: '#16A34A',
  },
  timelinePlanButtonPressed: {
    opacity: 0.72,
  },
  timelinePlanButtonDisabled: {
    opacity: 0.45,
  },
  timelinePlanText: {
    fontSize: 12,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  timelinePlanTextActive: {
    color: '#FFFFFF',
  },
  timelinePlanTextMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
  },
});
