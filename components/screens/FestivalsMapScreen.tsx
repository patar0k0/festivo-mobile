import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivals } from '@/lib/api/festivals';
import { BULGARIA_REGION, getSofiaRegion, isValidCoordinatePair, looksLikeBulgaria } from '@/lib/map/coordinates';

const MAX_MARKERS = 55;

function itemCoordinate(item: FestivalListItem): { latitude: number; longitude: number } | null {
  const lat = item.lat;
  const lng = item.lng;
  if (lat == null || lng == null) return null;
  if (!isValidCoordinatePair(lat, lng)) return null;
  if (!looksLikeBulgaria(lat, lng)) return null;
  return { latitude: lat, longitude: lng };
}

export default function FestivalsMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<FestivalListItem | null>(null);
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['festivals', 'map', 'trending'],
    queryFn: () => getFestivals({ sort: 'trending', limit: 80 }),
    staleTime: 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        if (isValidCoordinatePair(la, lo) && looksLikeBulgaria(la, lo)) {
          setUserLoc({ latitude: la, longitude: lo });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markerItems = useMemo(() => {
    if (!data?.length) return [];
    const withCoords: FestivalListItem[] = [];
    for (const item of data) {
      if (itemCoordinate(item)) withCoords.push(item);
    }
    if (userLoc && withCoords.length > 1) {
      withCoords.sort((a, b) => {
        const ca = itemCoordinate(a)!;
        const cb = itemCoordinate(b)!;
        const da = (ca.latitude - userLoc.latitude) ** 2 + (ca.longitude - userLoc.longitude) ** 2;
        const db = (cb.latitude - userLoc.latitude) ** 2 + (cb.longitude - userLoc.longitude) ** 2;
        return da - db;
      });
    }
    return withCoords.slice(0, MAX_MARKERS);
  }, [data, userLoc]);

  const initialRegion = useMemo(() => {
    if (userLoc) {
      return {
        latitude: userLoc.latitude,
        longitude: userLoc.longitude,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      };
    }
    return BULGARIA_REGION;
  }, [userLoc]);

  const onRecenter = useCallback(() => {
    void Haptics.selectionAsync();
    const m = mapRef.current;
    if (!m) return;
    const reg = userLoc
      ? {
          latitude: userLoc.latitude,
          longitude: userLoc.longitude,
          latitudeDelta: 0.35,
          longitudeDelta: 0.35,
        }
      : getSofiaRegion(0.5);
    m.animateToRegion(reg, 520);
  }, [userLoc]);

  const onMarkerPress = useCallback((item: FestivalListItem) => {
    void Haptics.selectionAsync();
    setSelected(item);
    const c = itemCoordinate(item);
    const m = mapRef.current;
    if (m && c) {
      // Nudge the active marker up a touch so the bottom preview card doesn't cover it.
      m.animateToRegion(
        {
          latitude: c.latitude - 0.02,
          longitude: c.longitude,
          latitudeDelta: 0.18,
          longitudeDelta: 0.18,
        },
        420,
      );
    }
  }, []);

  const openDetail = useCallback(
    (item: FestivalListItem) => {
      router.push(`/festival/${item.slug}`);
    },
    [router],
  );

  if (isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={festivalUi.colors.text} />
        <Text style={styles.hint}>Зареждане на карта…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={festivalUi.colors.muted} />
        <Text style={styles.errorTitle}>Не успяхме да заредим фестивалите.</Text>
        <PressableScale
          onPress={() => refetch()}
          pressedScale={0.96}
          pressedOpacity={0.9}
          style={styles.retry}>
          <Text style={styles.retryText}>Опитай отново</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation={Boolean(userLoc)}
        showsMyLocationButton={false}
        toolbarEnabled={false}>
        {markerItems.map((item) => {
          const c = itemCoordinate(item)!;
          return (
            <Marker
              key={item.festivalId}
              coordinate={c}
              title={item.title}
              onPress={() => onMarkerPress(item)}
              tracksViewChanges={false}
              pinColor={selected?.festivalId === item.festivalId ? '#4F46E5' : '#111827'}
            />
          );
        })}
      </MapView>

      <PressableScale
        onPress={onRecenter}
        pressedScale={0.92}
        pressedOpacity={0.85}
        style={[styles.fab, { bottom: 96 + Math.max(insets.bottom, 8) }]}
        accessibilityRole="button"
        accessibilityLabel="Центрирай картата">
        <Ionicons name="locate" size={22} color={festivalUi.colors.text} />
      </PressableScale>

      {isRefetching ? (
        <Reanimated.View
          entering={FadeIn.duration(160)}
          style={[styles.refreshBadge, { top: insets.top + 8 }]}>
          <ActivityIndicator size="small" color={festivalUi.colors.text} />
        </Reanimated.View>
      ) : null}

      {markerItems.length === 0 ? (
        <Reanimated.View
          entering={FadeIn.duration(220)}
          style={[styles.emptyFloating, { top: insets.top + 10 }]}>
          <Text style={styles.emptyTitle}>Няма фестивали с координати</Text>
          <Text style={styles.emptySub}>Опитай по-късно или отвори списъка „Начало“.</Text>
        </Reanimated.View>
      ) : null}

      {selected ? (
        <Reanimated.View
          key={selected.festivalId}
          entering={FadeInDown.duration(220).springify().damping(16).mass(0.7)}
          style={[
            styles.previewCardWrap,
            { bottom: Math.max(insets.bottom, 10) + 8 },
          ]}>
          <PressableScale
            onPress={() => openDetail(selected)}
            pressedScale={0.985}
            pressedOpacity={0.92}
            style={styles.previewCard}>
            {selected.image_url ? (
              <ExpoImage
                source={{ uri: selected.image_url }}
                style={styles.previewImg}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.previewImg, styles.previewPh]} />
            )}
            <View style={styles.previewBody}>
              <Text style={styles.previewTitle} numberOfLines={2}>
                {selected.title}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {selected.city}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={festivalUi.colors.secondary} />
          </PressableScale>
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E5E7EB' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  hint: { fontSize: 15, color: festivalUi.colors.secondary, fontWeight: '600' },
  errorTitle: { fontSize: 17, fontWeight: '700', color: festivalUi.colors.text, textAlign: 'center' },
  retry: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: festivalUi.colors.buttonBg,
    borderRadius: 999,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
    }),
  },
  refreshBadge: {
    position: 'absolute',
    right: 16,
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  emptyFloating: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: { fontWeight: '800', fontSize: 15, color: festivalUi.colors.text },
  emptySub: { marginTop: 4, fontSize: 14, color: festivalUi.colors.secondary },
  previewCardWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
    }),
  },
  previewImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F3F4F6' },
  previewPh: { backgroundColor: '#E5E7EB' },
  previewBody: { flex: 1, minWidth: 0 },
  previewTitle: { fontSize: 16, fontWeight: '800', color: festivalUi.colors.text },
  previewMeta: { marginTop: 4, fontSize: 14, color: festivalUi.colors.secondary, fontWeight: '600' },
});
