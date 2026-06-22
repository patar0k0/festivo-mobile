import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { festivalUi } from '@/components/ui/FestivalCard';

export type PlannedScheduleEntry = {
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

type CalendarGroup = { date: string; entries: PlannedScheduleEntry[] };

type Props = {
  groups: CalendarGroup[];
  onPressEntry: (entry: PlannedScheduleEntry) => void;
  loading: boolean;
  hasSavedItems: boolean;
  orphanedCount: number;
  onCleanupOrphans: () => void;
  cleaningUp: boolean;
};

function todayYmdLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export { formatCalendarDateLabel };

export function PlannerCalendar({
  groups,
  onPressEntry,
  loading,
  hasSavedItems,
  orphanedCount,
  onCleanupOrphans,
  cleaningUp,
}: Props) {
  const ymdToday = todayYmdLocal();

  if (!groups.length) {
    if (loading && hasSavedItems) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={festivalUi.colors.text} />
          <Text style={[styles.emptyText, { marginTop: 10 }]}>Зарежда се програмата…</Text>
        </View>
      );
    }
    if (hasSavedItems && orphanedCount > 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Точките вече не са в програмата</Text>
          <Text style={styles.emptyText}>
            {orphanedCount === 1
              ? '1 точка, която беше в плана ти, е премахната от организатора. Изчисти я, за да обновиш броячите.'
              : `${orphanedCount} точки, които бяха в плана ти, са премахнати от организатора. Изчисти ги, за да обновиш броячите.`}
          </Text>
          <Pressable
            onPress={onCleanupOrphans}
            disabled={cleaningUp}
            style={({ pressed }) => [
              styles.cleanupBtn,
              pressed && !cleaningUp && styles.cleanupBtnPressed,
              cleaningUp && styles.cleanupBtnDisabled,
            ]}>
            {cleaningUp ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.cleanupBtnText}>
                Изчисти {orphanedCount} {orphanedCount === 1 ? 'точка' : 'точки'}
              </Text>
            )}
          </Pressable>
        </View>
      );
    }
    if (hasSavedItems) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Програмата се обновява</Text>
          <Text style={styles.emptyText}>
            Точките са в плана ти, но детайлите за фестивала още не са синхронизирани. Дръпни надолу, за да опресниш.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Няма избрани часове</Text>
        <Text style={styles.emptyText}>
          Отвори програма на фестивал и добави конкретни точки, за да се появят тук.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
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
          <View key={group.date} style={[styles.dayCard, isToday && styles.dayCardToday]}>
            <Pressable
              onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              style={styles.dayHeaderPressable}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={[styles.dateLabel, isToday && styles.dateLabelToday]}>
                    {formatCalendarDateLabel(group.date)}
                  </Text>
                  <Text style={styles.dateSub}>
                    {busy ? 'Натоварен ден' : `${group.entries.length} планирани точки`}
                  </Text>
                </View>
                <View style={[styles.busyBadge, busy && styles.busyBadgeActive]}>
                  <Text style={[styles.busyBadgeText, busy && styles.busyBadgeTextActive]}>
                    {hasConflicts ? 'Конфликт' : busy ? 'Натоварен' : 'OK'}
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
                    styles.entry,
                    isNextUp && styles.entryNext,
                    pressed && styles.entryPressed,
                  ]}>
                  <View style={styles.timeRail}>
                    <Text style={[styles.time, isNextUp && styles.timeNext]}>{entry.timeLabel}</Text>
                  </View>
                  <View style={styles.entryBody}>
                    <Text style={[styles.entryTitle, isNextUp && styles.entryTitleNext]} numberOfLines={2}>
                      {entry.title}
                    </Text>
                    <Text style={styles.entryMeta} numberOfLines={1}>
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

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: festivalUi.colors.text },
  emptyText: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
  },
  cleanupBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanupBtnPressed: { opacity: 0.85 },
  cleanupBtnDisabled: { opacity: 0.55 },
  cleanupBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  dayCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dayCardToday: { borderColor: '#A5B4FC', backgroundColor: '#FAFAFF' },
  dayHeaderPressable: { marginHorizontal: -4, marginTop: -2, borderRadius: 10 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dateLabel: { fontSize: 16, fontWeight: '800', color: festivalUi.colors.text },
  dateLabelToday: { color: '#3730A3' },
  dateSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: festivalUi.colors.secondary },
  busyBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  busyBadgeActive: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  busyBadgeText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  busyBadgeTextActive: { color: '#92400E' },
  entry: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
    paddingBottom: 7,
  },
  entryNext: {
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderTopWidth: 0,
    marginTop: 4,
  },
  entryPressed: { opacity: 0.75 },
  timeRail: { width: 72 },
  time: { fontSize: 12, fontWeight: '800', color: '#4F46E5' },
  timeNext: { color: '#312E81' },
  entryBody: { flex: 1, minWidth: 0 },
  entryTitle: { fontSize: 14, fontWeight: '800', color: festivalUi.colors.text, lineHeight: 19 },
  entryTitleNext: { fontSize: 15, fontWeight: '900', color: '#1E1B4B' },
  entryMeta: { marginTop: 4, fontSize: 12, color: festivalUi.colors.secondary },
});
