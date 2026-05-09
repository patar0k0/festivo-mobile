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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivals } from '@/lib/api/festivals';
import { trackEvent } from '@/lib/analytics/track';
import { BULGARIA_REGION, getSofiaRegion, isValidCoordinatePair, looksLikeBulgaria } from '@/lib/map/coordinates';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';

const MAX_VISIBLE_POINTS = 90;
const MAX_RAW_VIEWPORT = 200;
const REGION_DEBOUNCE_MS = 420;
/** After custom Marker children mount on Android Google Maps, allow one paint cycle then stop tracking (avoids empty snapshots). */
const ANDROID_MARKER_TRACK_VIEW_MS = 480;
const CATEGORY_FILTERS = [
  { key: 'all', label: 'Всички' },
  { key: 'music', label: 'Music' },
  { key: 'food', label: 'Food' },
  { key: 'culture', label: 'Culture' },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]['key'];
type ClusterPoint = {
  id: string;
  latitude: number;
  longitude: number;
  items: FestivalListItem[];
};

type MapTier = 'A' | 'B' | 'C' | 'D';

type MapDevDiagnostics = {
  fetched: number;
  validCoordCount: number;
  bgValidCount: number;
  viewportBgCount: number;
  tierAInputCount: number;
  tierBInputCount: number;
  tierCInputCount: number;
  tierDInputCount: number;
  clusteredMarkers: number;
  finalRenderedMarkers: number;
  fallbackActivation: MapTier | 'none';
  /** How Marker children are produced: grid buckets vs one Marker per festival in viewport. */
  markerLayoutMode: 'grid' | 'raw' | 'none';
};

function itemCoordinateLoose(item: FestivalListItem): { latitude: number; longitude: number } | null {
  const lat = item.lat;
  const lng = item.lng;
  if (lat == null || lng == null) return null;
  if (!isValidCoordinatePair(lat, lng)) return null;
  return { latitude: lat, longitude: lng };
}

function itemCoordinateBg(item: FestivalListItem): { latitude: number; longitude: number } | null {
  const c = itemCoordinateLoose(item);
  if (!c) return null;
  if (!looksLikeBulgaria(c.latitude, c.longitude)) return null;
  return c;
}

function resolveMapCoordinate(item: FestivalListItem): { latitude: number; longitude: number } | null {
  return itemCoordinateBg(item) ?? itemCoordinateLoose(item);
}

function filterViewport(
  items: FestivalListItem[],
  coordAt: (item: FestivalListItem) => { latitude: number; longitude: number } | null,
  region: Region | null,
): FestivalListItem[] {
  if (!region) return items;
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  return items.filter((item) => {
    const c = coordAt(item);
    if (!c) return false;
    return c.latitude >= latMin && c.latitude <= latMax && c.longitude >= lngMin && c.longitude <= lngMax;
  });
}

function sortByUserDistance(
  items: FestivalListItem[],
  coordAt: (item: FestivalListItem) => { latitude: number; longitude: number } | null,
  userLoc: { latitude: number; longitude: number } | null,
): FestivalListItem[] {
  const copy = [...items];
  if (userLoc && copy.length > 1) {
    copy.sort((a, b) => {
      const ca = coordAt(a);
      const cb = coordAt(b);
      if (!ca || !cb) return 0;
      const da = (ca.latitude - userLoc.latitude) ** 2 + (ca.longitude - userLoc.longitude) ** 2;
      const db = (cb.latitude - userLoc.latitude) ** 2 + (cb.longitude - userLoc.longitude) ** 2;
      return da - db;
    });
  }
  return copy;
}

function buildGridClusters(
  markerItems: FestivalListItem[],
  region: Region | null,
  coordAt: (item: FestivalListItem) => { latitude: number; longitude: number } | null,
): ClusterPoint[] {
  if (!markerItems.length) return [];
  if (!region) {
    return markerItems.flatMap((item) => {
      const c = coordAt(item);
      if (!c) return [];
      return [
        {
          id: `single:${item.festivalId}`,
          latitude: c.latitude,
          longitude: c.longitude,
          items: [item],
        },
      ];
    });
  }
  const cellLat = Math.max(0.015, region.latitudeDelta / 11);
  const cellLng = Math.max(0.015, region.longitudeDelta / 11);
  const clusters = new Map<string, ClusterPoint>();
  for (const item of markerItems) {
    const c = coordAt(item);
    if (!c) continue;
    const y = Math.floor(c.latitude / cellLat);
    const x = Math.floor(c.longitude / cellLng);
    const key = `${x}:${y}`;
    const existing = clusters.get(key);
    if (!existing) {
      clusters.set(key, { id: key, latitude: c.latitude, longitude: c.longitude, items: [item] });
    } else {
      existing.items.push(item);
      const n = existing.items.length;
      existing.latitude = (existing.latitude * (n - 1) + c.latitude) / n;
      existing.longitude = (existing.longitude * (n - 1) + c.longitude) / n;
    }
  }
  return [...clusters.values()];
}

function buildRawViewportClusters(
  markerItems: FestivalListItem[],
  coordAt: (item: FestivalListItem) => { latitude: number; longitude: number } | null,
): ClusterPoint[] {
  return markerItems.flatMap((item) => {
    const c = coordAt(item);
    if (!c) return [];
    return [
      {
        id: `raw:${item.festivalId}`,
        latitude: c.latitude,
        longitude: c.longitude,
        items: [item],
      },
    ];
  });
}

export default function FestivalsMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<FestivalListItem | null>(null);
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [activeRegion, setActiveRegion] = useState<Region | null>(null);
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [searchAreaDirty, setSearchAreaDirty] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [androidMapTracksViewChanges, setAndroidMapTracksViewChanges] = useState(
    () => Platform.OS === 'android',
  );

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['festivals', 'map', 'trending', activeCategory],
    queryFn: () =>
      getFestivals({
        sort: 'trending',
        limit: 220,
        ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
      }),
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

  const { clusteredPoints, devDiagnostics } = useMemo(() => {
    const list = data ?? [];
    const fetched = list.length;
    const region = activeRegion ?? pendingRegion;

    let validCoordCount = 0;
    let bgValidCount = 0;
    const bgItems: FestivalListItem[] = [];
    const validItems: FestivalListItem[] = [];
    for (const item of list) {
      if (itemCoordinateLoose(item)) {
        validCoordCount++;
        validItems.push(item);
      }
      if (itemCoordinateBg(item)) {
        bgValidCount++;
        bgItems.push(item);
      }
    }

    const bgSorted = sortByUserDistance(bgItems, itemCoordinateBg, userLoc);
    const validSorted = sortByUserDistance(validItems, itemCoordinateLoose, userLoc);
    const vpBg = filterViewport(bgSorted, itemCoordinateBg, region);
    const viewportBgCount = vpBg.length;

    let tier: MapTier = 'A';
    let clustered: ClusterPoint[] = [];
    let tierAInputCount = 0;
    let tierBInputCount = 0;
    let tierCInputCount = 0;
    let tierDInputCount = 0;

    const aItems = vpBg.slice(0, MAX_VISIBLE_POINTS);
    tierAInputCount = aItems.length;
    clustered = buildGridClusters(aItems, region, itemCoordinateBg);

    if (clustered.length > 0) {
      tier = 'A';
    } else {
      const bItems = vpBg.slice(0, MAX_RAW_VIEWPORT);
      tierBInputCount = bItems.length;
      clustered = buildRawViewportClusters(bItems, itemCoordinateBg);
      if (clustered.length > 0) {
        tier = 'B';
      } else {
        const cItems = bgSorted.slice(0, MAX_VISIBLE_POINTS);
        tierCInputCount = cItems.length;
        clustered = buildGridClusters(cItems, region, itemCoordinateBg);
        if (clustered.length > 0) {
          tier = 'C';
        } else {
          const dItems = validSorted.slice(0, MAX_VISIBLE_POINTS);
          tierDInputCount = dItems.length;
          clustered = buildGridClusters(dItems, region, itemCoordinateLoose);
          tier = 'D';
        }
      }
    }

    const finalRenderedMarkers = clustered.reduce((n, c) => n + c.items.length, 0);
    const markerLayoutMode: MapDevDiagnostics['markerLayoutMode'] =
      clustered.length === 0 ? 'none' : tier === 'B' ? 'raw' : 'grid';
    const devDiagnostics: MapDevDiagnostics = {
      fetched,
      validCoordCount,
      bgValidCount,
      viewportBgCount,
      tierAInputCount,
      tierBInputCount,
      tierCInputCount,
      tierDInputCount,
      clusteredMarkers: clustered.length,
      finalRenderedMarkers,
      fallbackActivation: tier === 'A' ? 'none' : tier,
      markerLayoutMode,
    };

    return { clusteredPoints: clustered, devDiagnostics };
  }, [activeRegion, data, pendingRegion, userLoc]);

  const clusterTrackSig = useMemo(() => {
    if (!clusteredPoints.length) return '';
    const ids = clusteredPoints.map((c) => c.id);
    ids.sort();
    return ids.join('|');
  }, [clusteredPoints]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (!clusterTrackSig) {
      setAndroidMapTracksViewChanges(false);
      if (__DEV__) {
        console.log('[FestivalsMap][markerHydration]', {
          markerHydrationActive: false,
          tracksViewChanges: false,
          reason: 'no_cluster_markers',
        });
      }
      return;
    }

    setAndroidMapTracksViewChanges(true);
    if (__DEV__) {
      console.log('[FestivalsMap][markerHydration]', {
        markerHydrationActive: true,
        tracksViewChanges: true,
        clusterMarkerCount: clusterTrackSig.split('|').length,
        clusterTrackSigLength: clusterTrackSig.length,
      });
    }

    const timer = setTimeout(() => {
      setAndroidMapTracksViewChanges(false);
      if (__DEV__) {
        console.log('[FestivalsMap][markerHydration]', {
          markerHydrationActive: false,
          tracksViewChanges: false,
          afterMs: ANDROID_MARKER_TRACK_VIEW_MS,
        });
      }
    }, ANDROID_MARKER_TRACK_VIEW_MS);

    return () => clearTimeout(timer);
  }, [clusterTrackSig]);

  useEffect(() => {
    if (!__DEV__) return;
    const d = devDiagnostics;
    const droppedNoFiniteCoord = d.fetched - d.validCoordCount;
    const droppedOutsideBg = d.validCoordCount - d.bgValidCount;
    const droppedViewport = d.bgValidCount - d.viewportBgCount;
    console.log('[FestivalsMap][diag]', {
      fetched: d.fetched,
      validCoords: d.validCoordCount,
      bulgariaValidCoords: d.bgValidCount,
      viewportBgVisible: d.viewportBgCount,
      clusteredMapMarkers: d.clusteredMarkers,
      finalRenderedFestivalMarkers: d.finalRenderedMarkers,
      fallbackActivationReason: d.fallbackActivation,
      displayTier: d.fallbackActivation === 'none' ? 'A' : d.fallbackActivation,
      stagesDropped: {
        missingOrInvalidLatLng: droppedNoFiniteCoord,
        outsideLooksLikeBulgaria: droppedOutsideBg,
        outsideViewportAmongBg: droppedViewport,
      },
      tierInputs: {
        A_cluster_viewport_cap90: d.tierAInputCount,
        B_raw_viewport_cap200: d.tierBInputCount,
        C_cluster_allBg_cap90: d.tierCInputCount,
        D_cluster_allValid_cap90: d.tierDInputCount,
      },
      markerLayoutMode: d.markerLayoutMode,
      activeCategory,
    });
  }, [activeCategory, devDiagnostics]);

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
    void trackEvent({ event: 'map_interaction', source: 'recenter' });
  }, [userLoc]);

  const onMarkerPress = useCallback((item: FestivalListItem) => {
    void Haptics.selectionAsync();
    setSelected(item);
    const c = resolveMapCoordinate(item);
    const m = mapRef.current;
    if (m && c) {
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

  const onSelectCluster = useCallback((cluster: ClusterPoint) => {
    if (cluster.items.length <= 1) {
      onMarkerPress(cluster.items[0]!);
      return;
    }
    const m = mapRef.current;
    if (!m) return;
    m.animateToRegion(
      {
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        latitudeDelta: Math.max(0.04, (activeRegion?.latitudeDelta ?? 0.2) * 0.55),
        longitudeDelta: Math.max(0.04, (activeRegion?.longitudeDelta ?? 0.2) * 0.55),
      },
      280,
    );
    void trackEvent({ event: 'map_interaction', source: 'cluster_zoom', metadata: { size: cluster.items.length } });
  }, [activeRegion?.latitudeDelta, activeRegion?.longitudeDelta, onMarkerPress]);

  const openDetail = useCallback(
    (item: FestivalListItem) => {
      void trackEvent({ event: 'map_interaction', source: 'open_card', slug: item.slug, festival_id: item.festivalId });
      router.push(festivalDetailHref(item.slug));
    },
    [router],
  );

  const onRegionChangeComplete = useCallback((region: Region) => {
    setPendingRegion(region);
    setSearchAreaDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setActiveRegion(region);
      setSearchAreaDirty(false);
    }, REGION_DEBOUNCE_MS);
  }, []);

  const onSearchThisArea = useCallback(() => {
    if (pendingRegion) {
      setActiveRegion(pendingRegion);
      setSearchAreaDirty(false);
      void trackEvent({
        event: 'map_search_area',
        source: 'map',
        metadata: { lat: pendingRegion.latitude, lng: pendingRegion.longitude },
      });
    }
  }, [pendingRegion]);

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

  const showEmptyCoords = devDiagnostics.fetched > 0 && devDiagnostics.validCoordCount === 0;
  const showNoMatchesCategory = devDiagnostics.fetched === 0;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={Boolean(userLoc)}
        showsMyLocationButton={false}
        toolbarEnabled={false}>
        {clusteredPoints.map((cluster) => {
          const isSingle = cluster.items.length === 1;
          const item = cluster.items[0]!;
          const isActive =
            selected != null && cluster.items.some((it) => it.festivalId === selected.festivalId);
          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              title={isSingle ? item.title : `${cluster.items.length} festivals`}
              onPress={() => onSelectCluster(cluster)}
              tracksViewChanges={
                Platform.OS === 'android' ? androidMapTracksViewChanges : false
              }
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.clusterMarker, isActive && styles.clusterMarkerActive]}>
                <Text style={styles.clusterText}>{isSingle ? '•' : String(cluster.items.length)}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.categoryBar, { top: insets.top + 10 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORY_FILTERS.map((filter) => (
            <Pressable
              key={filter.key}
              onPress={() => setActiveCategory(filter.key)}
              style={({ pressed }) => [
                styles.categoryChip,
                activeCategory === filter.key && styles.categoryChipActive,
                pressed && styles.categoryChipPressed,
              ]}
            >
              <Text style={[styles.categoryChipText, activeCategory === filter.key && styles.categoryChipTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {searchAreaDirty ? (
        <PressableScale
          onPress={onSearchThisArea}
          pressedScale={0.96}
          pressedOpacity={0.88}
          style={[styles.searchAreaBtn, { top: insets.top + 62 }]}
        >
          <Text style={styles.searchAreaText}>Search this area</Text>
        </PressableScale>
      ) : null}

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

      {showNoMatchesCategory ? (
        <Reanimated.View
          entering={FadeIn.duration(220)}
          style={[styles.emptyFloating, { top: insets.top + 10 }]}>
          <Text style={styles.emptyTitle}>Няма фестивали за този филтър</Text>
          <Text style={styles.emptySub}>Избери „Всички“ или друга категория.</Text>
        </Reanimated.View>
      ) : showEmptyCoords ? (
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
  categoryBar: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  categoryRow: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  categoryChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  categoryChipPressed: {
    opacity: 0.7,
  },
  categoryChipText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  searchAreaBtn: {
    position: 'absolute',
    left: 20,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchAreaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  clusterMarker: {
    minWidth: 24,
    minHeight: 24,
    paddingHorizontal: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  clusterMarkerActive: {
    transform: [{ scale: 1.16 }],
    backgroundColor: '#4F46E5',
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
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
