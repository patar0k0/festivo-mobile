import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';
import { isValidCoordinatePair, looksLikeBulgaria } from '@/lib/map/coordinates';

type Props = {
  latitude: number;
  longitude: number;
  title: string;
  addressLine: string;
  onOpenMaps: () => void;
};

export const FestivalMapPreview = memo(function FestivalMapPreview({
  latitude,
  longitude,
  title,
  addressLine,
  onOpenMaps,
}: Props) {
  if (!isValidCoordinatePair(latitude, longitude)) return null;
  if (!looksLikeBulgaria(latitude, longitude)) return null;

  const delta = 0.04;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Местоположение</Text>
      <View style={styles.mapShell}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          liteMode={Platform.OS === 'android'}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: delta,
            longitudeDelta: delta,
          }}>
          <Marker coordinate={{ latitude, longitude }} title={title} tracksViewChanges={false} />
        </MapView>
      </View>
      {addressLine ? (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={18} color={festivalUi.colors.secondary} />
          <Text style={styles.addressText} numberOfLines={3}>
            {addressLine}
          </Text>
        </View>
      ) : null}
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
  mapShell: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 150,
    backgroundColor: '#E5E7EB',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
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
