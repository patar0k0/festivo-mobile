import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { POPULAR_CATEGORIES_BG } from '@/components/search/PopularCategories';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { SearchFilters, SearchWhenPreset } from '@/lib/api/search';

type WhenOption = { value: SearchWhenPreset; label: string };

const WHEN_OPTIONS: WhenOption[] = [
  { value: 'today',      label: 'Днес' },
  { value: 'tomorrow',   label: 'Утре' },
  { value: 'weekend',    label: 'Този уикенд' },
  { value: 'this_week',  label: 'Тази седмица' },
  { value: 'this_month', label: 'Този месец' },
];

type Props = {
  visible: boolean;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
};

export function SearchFilterSheet({ visible, filters, onApply, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [when, setWhen] = useState<SearchFilters['when']>(filters.when);
  const [category, setCategory] = useState<string | undefined>(filters.category);
  const [free, setFree] = useState<boolean>(filters.free ?? false);

  useEffect(() => {
    if (!visible) return;
    setWhen(filters.when);
    setCategory(filters.category);
    setFree(filters.free ?? false);
    translateY.setValue(600);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 260, useNativeDriver: true }),
    ]).start();
  }, [visible, filters.when, filters.category, filters.free, backdropOpacity, translateY]);

  const closeAnimated = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const handleApply = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: SearchFilters = {};
    if (when) next.when = when;
    if (category) next.category = category;
    if (free) next.free = true;
    onApply(next);
    closeAnimated();
  };

  const handleReset = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onApply({});
    closeAnimated();
  };

  const hasActive = Boolean(when || category || free);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeAnimated}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8, transform: [{ translateY }] },
          ]}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Филтри</Text>
            {hasActive ? (
              <Pressable onPress={handleReset} hitSlop={12} style={styles.resetBtn}>
                <Text style={styles.resetText}>Нулирай</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Кога */}
          <Text style={styles.sectionLabel}>Кога</Text>
          <View style={styles.chipRow}>
            {WHEN_OPTIONS.map((opt) => {
              const active = when === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setWhen(active ? undefined : opt.value);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>

          {/* Категория */}
          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Категория</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.categoryScroll}>
            {POPULAR_CATEGORIES_BG.map((cat) => {
              const active = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory(active ? undefined : cat);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {cat}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Само безплатни */}
          <View style={styles.freeRow}>
            <View style={styles.freeLabelWrap}>
              <Ionicons name="ticket-outline" size={18} color={festivalUi.colors.text} />
              <Text style={styles.freeText}>Само безплатни</Text>
            </View>
            <Switch
              value={free}
              onValueChange={(v) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFree(v);
              }}
              trackColor={{ false: '#E5E7EB', true: '#4F46E5' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E7EB"
            />
          </View>

          {/* Приложи */}
          <Pressable
            onPress={handleApply}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}>
            <Text style={styles.applyBtnText}>Приложи</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.42)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 20,
    paddingTop: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
    }),
  },
  handle: {
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  resetBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  resetText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  sectionLabelSpaced: { marginTop: 20 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  filterChipEmoji: { fontSize: 14 },
  filterChipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  filterChipTextActive: { color: '#FFFFFF' },
  categoryScroll: { gap: 8, paddingBottom: 4 },
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  freeLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  freeText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  applyBtn: {
    marginTop: 12,
    backgroundColor: '#7c2d12',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  applyBtnPressed: { opacity: 0.88 },
  applyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: -0.2 },
});
