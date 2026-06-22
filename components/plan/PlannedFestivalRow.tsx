import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import type { MobilePlanReminderType } from '@/lib/api/mobilePlan';
import { getStartsInLabelBg } from '@/lib/festival/relativeDate';

export type PlannedFestivalRowProps = {
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

export function PlannedFestivalRow({
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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.hero}>
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
            <View style={styles.heroPlaceholderInner}>
              <Text style={styles.heroPlaceholderEmoji}>🎉</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.topOverlay}>
          <View style={styles.datePill}>
            <Ionicons name="calendar" size={12} color="#FFFFFF" />
            <Text style={styles.datePillText}>{dateLabel}</Text>
            {startsIn ? <Text style={styles.datePillSub}>· {startsIn}</Text> : null}
          </View>
          <View style={styles.savedBadge}>
            <AnimatedBookmark filled size={14} color="#FFFFFF" />
          </View>
        </View>
        <View pointerEvents="none" style={styles.bottomOverlay}>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.cityRow}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.92)" />
            <Text style={styles.cityText} numberOfLines={1}>{item.city || 'България'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {organizerName ? (
          <Pressable
            onPress={hasOrganizer ? onPressOrganizer : undefined}
            disabled={!hasOrganizer}
            style={({ pressed }) => [styles.metaRow, hasOrganizer && pressed ? styles.metaRowPressed : null]}>
            <View style={styles.metaIcon}>
              <Ionicons name="person" size={13} color="#4F46E5" />
            </View>
            <Text style={styles.metaText} numberOfLines={1}>{organizerName}</Text>
            {hasOrganizer ? <Ionicons name="chevron-forward" size={16} color="#9CA3AF" /> : null}
          </Pressable>
        ) : null}

        <Pressable
          onPress={onPressReminder}
          style={({ pressed }) => [styles.metaRow, pressed ? styles.metaRowPressed : null]}>
          <View style={[styles.metaIcon, reminderActive && styles.metaIconActive]}>
            <Ionicons
              name={reminderActive ? 'notifications' : 'notifications-outline'}
              size={13}
              color={reminderActive ? '#D97706' : '#9CA3AF'}
            />
          </View>
          <Text style={[styles.metaText, !reminderActive && styles.metaTextMuted]} numberOfLines={1}>
            {reminderActive ? reminderLabel : 'Без напомняне'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </Pressable>

        <View style={styles.actions}>
          {plannedItemCount > 0 ? (
            <Pressable
              onPress={onPressProgram}
              style={({ pressed }) => [styles.primaryCta, pressed && styles.primaryCtaPressed]}>
              <Ionicons name="list" size={15} color="#FFFFFF" />
              <Text style={styles.primaryCtaText}>
                {plannedItemCount === 1 ? '1 точка' : `${plannedItemCount} точки`} · Програма
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onPressProgram}
              style={({ pressed }) => [styles.secondaryCta, pressed && styles.secondaryCtaPressed]}>
              <Ionicons name="list-outline" size={15} color={festivalUi.colors.text} />
              <Text style={styles.secondaryCtaText}>Виж програмата</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onPressMore}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
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

const styles = StyleSheet.create({
  card: {
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
  cardPressed: { opacity: 0.96 },
  hero: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E5E7EB',
  },
  heroPlaceholderInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderEmoji: { fontSize: 56 },
  topOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePill: {
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
  datePillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.1 },
  datePillSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600', marginLeft: 2 },
  savedBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  bottomOverlay: { position: 'absolute', bottom: 12, left: 14, right: 14 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cityRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cityText: { color: 'rgba(255,255,255,0.94)', fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  metaRowPressed: { opacity: 0.7 },
  metaIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  metaIconActive: { backgroundColor: '#FEF3C7' },
  metaText: { flex: 1, fontSize: 13, fontWeight: '600', color: festivalUi.colors.text },
  metaTextMuted: { color: '#9CA3AF', fontWeight: '500' },
  actions: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  primaryCtaPressed: { opacity: 0.88 },
  primaryCtaText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700', letterSpacing: 0.1 },
  secondaryCta: {
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
  secondaryCtaPressed: { opacity: 0.85 },
  secondaryCtaText: { color: festivalUi.colors.text, fontSize: 13.5, fontWeight: '700' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  iconBtnPressed: { opacity: 0.7 },
});
