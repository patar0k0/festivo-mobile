import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';

type Props = {
  addressLine: string;
  onOpenMaps: () => void;
};

export const FestivalMapPreview = memo(function FestivalMapPreview({
  addressLine,
  onOpenMaps,
}: Props) {
  if (!addressLine?.trim()) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Местоположение</Text>
      <View style={styles.addressRow}>
        <Ionicons name="location-outline" size={18} color={festivalUi.colors.secondary} />
        <Text style={styles.addressText} numberOfLines={3}>
          {addressLine}
        </Text>
      </View>
      <PressableScale
        onPress={onOpenMaps}
        pressedScale={0.98}
        pressedOpacity={0.9}
        style={styles.mapsCta}>
        <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
        <Text style={styles.mapsCtaText}>Отвори в Maps</Text>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: festivalUi.screenPadding,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  mapsCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: festivalUi.colors.buttonBg,
    borderRadius: 14,
    paddingVertical: 12,
  },
  mapsCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
