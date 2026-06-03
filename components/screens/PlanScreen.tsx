import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
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
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReminderBottomSheet } from '@/components/plan/ReminderBottomSheet';
import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { FestivalCard, festivalUi } from '@/components/ui/FestivalCard';
import { getRelativeDateLabel, getStartsInLabelBg } from '@/lib/festival/relativeDate';
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

type PlannedScheduleEntry = {
  scheduleItemId: string;
  festivalId: string;
  festivalSlug: string;
  festivalTitle: string;
  city: string;
  date: string;
  timeLabel: string;
  sortTime: number;
  sortKey: number;
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

function resolveGroup(startDate: string, endDate?: string | null): PlanGroupKey {
  const startDay = parseDay(startDate);
  const endDay = endDate ? parseDay(endDate) : null;
  const now = new Date();
  const today = Math.floor(now.getTime() / 86_400_000);
  // A festival is past only when its last day is before today.
  const lastDay = endDay ?? startDay;
  if (lastDay == null || lastDay < today) return 'past';
  if (startDay == null) return 'later';
  // Ongoing festival (started in the past but hasn't ended yet).
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
  // Past festivals can no longer receive a reminder — exclude them so the
  // preview reflects the next upcoming reminder, not the earliest saved
  // festival overall. A festival is past when its last day is strictly
  // before today (same rule as resolveGroup).
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
  // The festival title is shown right below as a card — repeating it here
  // doubles the same text. Keep this preview purely about the reminder
  // schedule and the relative date.
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
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.viewTab, active && styles.viewTabActive, pressed && styles.viewTabPressed]}>
      <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PlannerCalendar({
  groups,
  onPressEntry,
  loading,
  hasSavedItems,
  orphanedCount,
  onCleanupOrphans,
  cleaningUp,
}: {
  groups: { date: string; entries: PlannedScheduleEntry[] }[];
  onPressEntry: (entry: PlannedScheduleEntry) => void;
  /** True while the festival detail queries (needed to resolve item times) are still in flight. */
  loading: boolean;
  /** True when the plan state says the user has at least one schedule item saved on the server. */
  hasSavedItems: boolean;
  /** Saved schedule_item_ids that no longer appear in any hydrated festival schedule. */
  orphanedCount: number;
  onCleanupOrphans: () => void;
  cleaningUp: boolean;
}) {
  const ymdToday = todayYmdLocal();
  if (!groups.length) {
    if (loading && hasSavedItems) {
      return (
        <View style={styles.emptyCalendar}>
          <ActivityIndicator size="small" color={festivalUi.colors.text} />
          <Text style={[styles.emptyCalendarText, { marginTop: 10 }]}>Зарежда се програмата…</Text>
        </View>
      );
    }
    // Every saved id is orphaned in the live program (organizer recreated items,
    // leaving "Точки: N" stuck without a row to render). Offer a cleanup CTA.
    if (hasSavedItems && orphanedCount > 0) {
      return (
        <View style={styles.emptyCalendar}>
          <Text style={styles.emptyCalendarTitle}>Точките вече не са в програмата</Text>
          <Text style={styles.emptyCalendarText}>
            {orphanedCount === 1
              ? '1 точка, която беше в плана ти, е премахната от организатора. Изчисти я, за да обновиш броячите.'
              : `${orphanedCount} точки, които бяха в плана ти, са премахнати от организатора. Изчисти ги, за да обновиш броячите.`}
          </Text>
          <Pressable
            onPress={onCleanupOrphans}
            disabled={cleaningUp}
            style={({ pressed }) => [
              styles.emptyCleanupBtn,
              pressed && !cleaningUp && styles.emptyCleanupBtnPressed,
              cleaningUp && styles.emptyCleanupBtnDisabled,
            ]}>
            {cleaningUp ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.emptyCleanupBtnText}>
                Изчисти {orphanedCount} {orphanedCount === 1 ? 'точка' : 'точки'}
              </Text>
            )}
          </Pressable>
        </View>
      );
    }
    if (hasSavedItems) {
      return (
        <View style={styles.emptyCalendar}>
          <Text style={styles.emptyCalendarTitle}>Програмата се обновява</Text>
          <Text style={styles.emptyCalendarText}>
            Точките са в плана ти, но детайлите за фестивала още не са синхронизирани. Дръпни надолу, за да опресниш.
          </Text>
        </View>
      );
    }
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
        const isToday = group.date.slice(0, 10) === ymdToday;
        const hasConflicts = group.entries.some((entry, index) =>
          group.entries.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              Math.abs(other.sortTime - entry.sortTime) < 45 &&
              entry.sortTime < 24 * 60,
          ),
        );
        return (
          <View key={group.date} style={[styles.calendarDayCard, isToday && styles.calendarDayCardToday]}>
            <Pressable
              onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              style={styles.calendarDayHeaderPressable}>
              <View style={styles.calendarDayHeader}>
                <View>
                  <Text style={[styles.calendarDateLabel, isToday && styles.calendarDateLabelToday]}>
                    {formatCalendarDateLabel(group.date)}
                  </Text>
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
            </Pressable>
            {group.entries.map((entry, entryIndex) => {
              const isNextUp = isToday && entryIndex === 0;
              return (
                <Pressable
                  key={entry.scheduleItemId}
                  onPress={() => onPressEntry(entry)}
                  style={({ pressed }) => [
                    styles.calendarEntry,
                    isNextUp && styles.calendarEntryNext,
                    pressed && styles.calendarEntryPressed,
                  ]}>
                  <View style={styles.calendarTimeRail}>
                    <Text style={[styles.calendarTime, isNextUp && styles.calendarTimeNext]}>{entry.timeLabel}</Text>
                  </View>
                  <View style={styles.calendarEntryBody}>
                    <Text style={[styles.calendarEntryTitle, isNextUp && styles.calendarEntryTitleNext]} numberOfLines={2}>
                      {entry.title}
                    </Text>
                    <Text style={styles.calendarEntryMeta} numberOfLines={1}>
                      {entry.festivalTitle} · {entry.city}
                      {entry.stage ? ` · ${entry.stage}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

type StatTone = 'indigo' | 'amber' | 'emerald';

function StatTile({
  value,
  label,
  icon,
  tone,
  delay = 0,
}: {
  value: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: StatTone;
  delay?: number;
}) {
  const palette = STAT_TONE_PALETTE[tone];
  return (
    <Reanimated.View entering={FadeInDown.duration(360).delay(delay).springify().damping(16)} style={styles.statTile}>
      <View style={[styles.statIconBubble, { backgroundColor: palette.bubble }]}>
        <Ionicons name={icon} size={16} color={palette.icon} />
      </View>
      <AnimatedCount style={[styles.statTileValue, { color: palette.text }]} value={String(value)} />
      <Text style={styles.statTileLabel}>{label}</Text>
    </Reanimated.View>
  );
}

const STAT_TONE_PALETTE: Record<StatTone, { bubble: string; icon: string; text: string }> = {
  indigo: { bubble: '#EEF2FF', icon: '#4F46E5', text: '#0F172A' },
  amber: { bubble: '#FEF3C7', icon: '#D97706', text: '#0F172A' },
  emerald: { bubble: '#D1FAE5', icon: '#059669', text: '#0F172A' },
};

type PlannedFestivalRowProps = {
  item: FestivalListItem;
  reminder: MobilePlanReminderType;
  reminderLabel: string;
  plannedItemCount: number;
  removing: boolean;
  hasOrganizer: boolean;
  onPressCard: () => void;
  onPressProgram: () => void;
  onPressReminder: () => void;
  onPressMap: () => void;
  onPressOrganizer: () => void;
  onPressRemove: () => void;
};

const BG_MONTHS_SHORT = ['ян', 'фев', 'март', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];

function formatEditorialDate(start: string, end?: string): string {
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return start;
  const d = `${s.getDate()} ${BG_MONTHS_SHORT[s.getMonth()]}`;
  if (!end?.trim()) return d;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return d;
  if (s.toDateString() === e.toDateString()) return d;
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${BG_MONTHS_SHORT[e.getMonth()]}`;
  return `${d} – ${e.getDate()} ${BG_MONTHS_SHORT[e.getMonth()]}`;
}

function PlannedFestivalRow({
  item,
  reminder,
  reminderLabel,
  plannedItemCount,
  removing,
  hasOrganizer,
  onPressCard,
  onPressProgram,
  onPressReminder,
  onPressMap,
  onPressOrganizer,
  onPressRemove,
}: PlannedFestivalRowProps) {
  const dateLabel = formatEditorialDate(item.start_date, item.end_date);
  const startsIn = getStartsInLabelBg(item.start_date);
  const thumbUri = item.image_url ?? undefined;
  const reminderActive = reminder !== 'none';
  const organizerName = item.organizer?.name?.trim() || item.organizer_name?.trim() || null;

  const onPressMore = () => {
    Alert.alert(
      item.title,
      undefined,
      [
        { text: 'Карта', onPress: onPressMap },
        { text: reminderActive ? 'Промени напомнянето' : 'Добави напомняне', onPress: onPressReminder },
        { text: removing ? 'Премахва…' : 'Премахни от плана', style: 'destructive', onPress: onPressRemove },
        { text: 'Откажи', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  return (
    <Pressable
      onPress={onPressCard}
      style={({ pressed }) => [styles.editorialCard, pressed && styles.editorialCardPressed]}>
      {/* Hero */}
      <View style={styles.editorialHero}>
        {thumbUri ? (
          <ExpoImage
            source={{ uri: thumbUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            pointerEvents="none"
            colors={['#F87171', '#B91C1C']}
            style={StyleSheet.absoluteFill}>
            <View style={styles.editorialHeroPlaceholderInner}>
              <Text style={styles.editorialHeroPlaceholderEmoji}>🎉</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top overlay */}
        <View pointerEvents="none" style={styles.editorialTopOverlay}>
          <View style={styles.editorialDatePill}>
            <Ionicons name="calendar" size={12} color="#FFFFFF" />
            <Text style={styles.editorialDatePillText}>{dateLabel}</Text>
            {startsIn ? <Text style={styles.editorialDatePillSub}>· {startsIn}</Text> : null}
          </View>
          <View style={styles.editorialSavedBadge}>
            <AnimatedBookmark filled size={14} color="#FFFFFF" />
          </View>
        </View>

        {/* Bottom overlay */}
        <View pointerEvents="none" style={styles.editorialBottomOverlay}>
          <Text style={styles.editorialHeroTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.editorialCityRow}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.92)" />
            <Text style={styles.editorialCityText} numberOfLines={1}>
              {item.city || 'България'}
            </Text>
          </View>
        </View>
      </View>

      {/* Content section */}
      <View style={styles.editorialBody}>
        {organizerName ? (
          <Pressable
            onPress={hasOrganizer ? onPressOrganizer : undefined}
            disabled={!hasOrganizer}
            style={({ pressed }) => [
              styles.editorialMetaRow,
              hasOrganizer && pressed ? styles.editorialMetaRowPressed : null,
            ]}>
            <View style={styles.editorialMetaIcon}>
              <Ionicons name="person" size={13} color="#4F46E5" />
            </View>
            <Text style={styles.editorialMetaText} numberOfLines={1}>
              {organizerName}
            </Text>
            {hasOrganizer ? (
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            ) : null}
          </Pressable>
        ) : null}

        <Pressable
          onPress={onPressReminder}
          style={({ pressed }) => [
            styles.editorialMetaRow,
            pressed ? styles.editorialMetaRowPressed : null,
          ]}>
          <View style={[styles.editorialMetaIcon, reminderActive && styles.editorialMetaIconActive]}>
            <Ionicons
              name={reminderActive ? 'notifications' : 'notifications-outline'}
              size={13}
              color={reminderActive ? '#D97706' : '#9CA3AF'}
            />
          </View>
          <Text
            style={[
              styles.editorialMetaText,
              !reminderActive && styles.editorialMetaTextMuted,
            ]}
            numberOfLines={1}>
            {reminderActive ? reminderLabel : 'Без напомняне'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </Pressable>

        <View style={styles.editorialActions}>
          {plannedItemCount > 0 ? (
            <Pressable
              onPress={onPressProgram}
              style={({ pressed }) => [
                styles.editorialPrimaryCta,
                pressed && styles.editorialPrimaryCtaPressed,
              ]}>
              <Ionicons name="list" size={15} color="#FFFFFF" />
              <Text style={styles.editorialPrimaryCtaText}>
                {plannedItemCount === 1 ? '1 точка' : `${plannedItemCount} точки`} · Програма
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onPressProgram}
              style={({ pressed }) => [
                styles.editorialSecondaryCta,
                pressed && styles.editorialSecondaryCtaPressed,
              ]}>
              <Ionicons name="list-outline" size={15} color={festivalUi.colors.text} />
              <Text style={styles.editorialSecondaryCtaText}>Виж програмата</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onPressMore}
            hitSlop={8}
            style={({ pressed }) => [styles.editorialIconBtn, pressed && styles.editorialIconBtnPressed]}>
            {removing ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <Ionicons name="ellipsis-horizontal" size={18} color="#6B7280" />
            )}
          </Pressable>
        </View>
      </View>
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

  /**
   * Saved schedule_item_ids that no longer match any item in the live festival
   * details — orphans from an organizer editing/recreating the program. Only
   * trust this list after every detail query has settled, otherwise an
   * in-flight fetch would look like a missing item and we'd offer to wipe
   * legitimate plan rows.
   */
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
      // Idempotent removal — one call per orphan id, desiredInPlan=false always
      // deletes the row (no-op if already gone). Sequential is fine; orphans
      // are usually a handful at most.
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

  // Diagnose the "Точки: N but Календар is empty" mismatch.
  // Most common cause: the schedule item ids on the server's plan-state
  // response don't match any item.id in the festival detail's schedule.
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

  const onRefresh = () => {
    void planQuery.refetch();
  };

  const openReminderPicker = (festivalId: string) => {
    setPickerFestivalId(festivalId);
  };

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
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 48,
        },
      ]}>
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Моят план</Text>
        <View style={styles.statTilesRow}>
          <StatTile
            value={planQuery.stats.savedFestivalCount}
            label="В плана"
            icon="bookmark"
            tone="indigo"
            delay={0}
          />
          <View style={styles.statTilesDivider} />
          <StatTile
            value={planQuery.stats.plannedItemCount}
            label="Точки"
            icon="checkmark-circle"
            tone="amber"
            delay={60}
          />
          <View style={styles.statTilesDivider} />
          <StatTile
            value={planQuery.stats.upcomingCount}
            label="Предстоящи"
            icon="time"
            tone="emerald"
            delay={120}
          />
        </View>
        <View style={styles.reminderPreviewLine}>
          <Text style={styles.reminderPreviewLineIcon}>⏰</Text>
          <Text style={styles.reminderPreviewLineText} numberOfLines={2}>
            {nextReminderPreview}
          </Text>
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
                onPress={() =>
                  router.push(
                    festivalDetailHref(entry.festivalSlug, {
                      scheduleDay: entry.date.slice(0, 10),
                    }),
                  )
                }
                style={({ pressed }) => [
                  styles.previewRow,
                  index === 0 && styles.previewRowFirst,
                  pressed && styles.previewRowPressed,
                ]}>
                <Text style={styles.previewTime}>{entry.timeLabel}</Text>
                <View style={styles.previewBody}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {entry.title}
                  </Text>
                  <Text style={styles.previewMeta} numberOfLines={1}>
                    {entry.festivalTitle} · {entry.city}
                  </Text>
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
                onPress={() =>
                  router.push(
                    festivalDetailHref(entry.festivalSlug, {
                      scheduleDay: entry.date.slice(0, 10),
                    }),
                  )
                }
                style={({ pressed }) => [
                  styles.previewRow,
                  index === 0 && styles.previewRowFirst,
                  pressed && styles.previewRowPressed,
                ]}>
                <Text style={styles.previewTime}>{formatCalendarDateLabel(entry.date)}</Text>
                <View style={styles.previewBody}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {entry.title}
                  </Text>
                  <Text style={styles.previewMeta} numberOfLines={1}>
                    {entry.timeLabel} · {entry.festivalTitle}
                  </Text>
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
                  { onSettled: () => setRemovingIds((prev) => { const next = new Set(prev); next.delete(item.festivalId); return next; }) },
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
                        day ? festivalDetailHref(item.slug, { scheduleDay: day }) : festivalDetailHref(item.slug),
                      );
                    }}
                    onPressReminder={() => openReminderPicker(item.festivalId)}
                    onPressMap={() => router.push('/(tabs)/map')}
                    onPressOrganizer={() => {
                      const orgSlug = item.organizer?.slug?.trim();
                      if (orgSlug) {
                        router.push(`/organizer/${orgSlug}`);
                      } else if (item.organizer_name) {
                        // No slug in payload — fall back to a search prefilled with the name.
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
  statsLine: { fontSize: 14, color: festivalUi.colors.secondary, fontWeight: '600' },
  statTilesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 4,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  statIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statTileValue: {
    fontSize: 26,
    fontWeight: '900',
    color: festivalUi.colors.text,
    letterSpacing: -0.6,
  },
  statTileLabel: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statTilesDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 6,
  },
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
  reminderPreviewLineIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
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
  previewSection: {
    gap: 8,
  },
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
  previewRowPressed: {
    opacity: 0.82,
  },
  previewTime: {
    width: 56,
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
    paddingTop: 2,
  },
  previewBody: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 19,
  },
  previewMeta: {
    marginTop: 4,
    fontSize: 12,
    color: festivalUi.colors.secondary,
  },
  section: { marginTop: 16, gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: festivalUi.colors.text, marginBottom: 8, letterSpacing: -0.3 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    marginBottom: 6,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
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
  emptyCleanupBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCleanupBtnPressed: { opacity: 0.85 },
  emptyCleanupBtnDisabled: { opacity: 0.55 },
  emptyCleanupBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  calendarWrap: {
    gap: 12,
  },
  calendarDayCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  calendarDayCardToday: {
    borderColor: '#A5B4FC',
    backgroundColor: '#FAFAFF',
  },
  calendarDayHeaderPressable: {
    marginHorizontal: -4,
    marginTop: -2,
    borderRadius: 10,
  },
  calendarDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  calendarDateLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  calendarDateLabelToday: {
    color: '#3730A3',
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
    paddingTop: 8,
    paddingBottom: 7,
  },
  calendarEntryNext: {
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderTopWidth: 0,
    marginTop: 4,
  },
  calendarEntryPressed: {
    opacity: 0.75,
  },
  calendarTimeRail: {
    width: 72,
  },
  calendarTime: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
  },
  calendarTimeNext: {
    color: '#312E81',
  },
  calendarEntryBody: {
    flex: 1,
    minWidth: 0,
  },
  calendarEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 19,
  },
  calendarEntryTitleNext: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E1B4B',
  },
  calendarEntryMeta: {
    marginTop: 4,
    fontSize: 12,
    color: festivalUi.colors.secondary,
  },
  inlineActions: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  reminderChipEmphasis: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  reminderChipText: { fontSize: 12, fontWeight: '700', color: festivalUi.colors.text },
  reminderChipTextEmphasis: { color: '#166534' },
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
  removeChipDisabled: { opacity: 0.5 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastToggleText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },

  // Planned festival row (redesigned card)
  rowCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  rowCardPressed: { opacity: 0.92 },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  rowThumb: { width: '100%', height: '100%' },
  rowThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowThumbEmoji: { fontSize: 26 },
  rowBody: { flex: 1, minWidth: 0, paddingRight: 22 },
  rowTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 20,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  rowSavedIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  rowProgramChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  rowProgramChipPressed: { opacity: 0.8 },
  rowProgramChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  rowProgramChipArrow: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
    marginTop: -1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  rowChipPressed: { opacity: 0.7 },
  rowReminderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    maxWidth: '52%',
  },
  rowReminderChipActive: {
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  rowReminderEmoji: { fontSize: 12 },
  rowReminderText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: festivalUi.colors.text,
  },
  rowReminderTextActive: { color: '#3730A3' },
  rowIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  rowIconBtnEmoji: { fontSize: 14 },
  rowRemoveLink: { paddingVertical: 4, paddingHorizontal: 4 },
  rowRemoveLinkDisabled: { opacity: 0.5 },
  rowRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  /* ── Editorial card ─────────────────────────────────────────── */
  editorialCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  editorialCardPressed: { opacity: 0.96 },
  editorialHero: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E5E7EB',
  },
  editorialHeroPlaceholderInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorialHeroPlaceholderEmoji: { fontSize: 56 },
  editorialTopOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorialDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  editorialDatePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  editorialDatePillSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  editorialSavedBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  editorialBottomOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
  },
  editorialHeroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  editorialCityRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editorialCityText: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  editorialBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 4,
  },
  editorialMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  editorialMetaRowPressed: { opacity: 0.7 },
  editorialMetaIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  editorialMetaIconActive: {
    backgroundColor: '#FEF3C7',
  },
  editorialMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  editorialMetaTextMuted: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  editorialActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorialPrimaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  editorialPrimaryCtaPressed: { opacity: 0.88 },
  editorialPrimaryCtaText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  editorialSecondaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  editorialSecondaryCtaPressed: { opacity: 0.85 },
  editorialSecondaryCtaText: {
    color: festivalUi.colors.text,
    fontSize: 13.5,
    fontWeight: '700',
  },
  editorialIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  editorialIconBtnPressed: { opacity: 0.7 },
});
