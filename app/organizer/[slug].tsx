import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrganizerSocialIconRow, type OrganizerSocialLink } from '@/components/organizer/OrganizerSocialIconRow';
import { VerifiedBadge } from '@/components/organizer/VerifiedBadge';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton, skeletonRadii, skeletonRhythm } from '@/components/ui/Skeleton';
import { FestivalCard, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getOrganizerBySlug } from '@/lib/api/organizers';
import { useAuth } from '@/lib/auth/useAuth';
import { useToggleOrganizerFollowMutation } from '@/lib/query/useToggleOrganizerFollowMutation';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { getOrganizerPublicUrl } from '@/lib/site';

type LinkKey = 'website' | 'facebook' | 'instagram' | 'tiktok';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const LINK_ICONS: Record<LinkKey, IoniconName> = {
  website: 'globe-outline',
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  tiktok: 'musical-notes-outline',
};

const LINK_LABELS: Record<LinkKey, string> = {
  website: 'Уебсайт',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const LINK_ORDER: LinkKey[] = ['website', 'facebook', 'instagram', 'tiktok'];

function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Returns a native app deep-link for known social networks, or null for others. */
function buildNativeUrl(key: LinkKey, webUrl: string): string | null {
  if (key === 'instagram') {
    const m = webUrl.match(/instagram\.com\/([^/?#]+)/i);
    const username = m?.[1]?.replace(/\/$/, '');
    return username ? `instagram://user?username=${username}` : null;
  }
  if (key === 'facebook') {
    // fb://facewebmodal opens the in-app browser on Android with the correct page
    // On iOS the Facebook app handles fb://profile/<slug> for pages
    const m = webUrl.match(/facebook\.com\/([^/?#]+)/i);
    const slug = m?.[1]?.replace(/\/$/, '');
    if (!slug) return null;
    return `fb://facewebmodal/f?href=${encodeURIComponent(webUrl)}`;
  }
  return null;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toLocaleUpperCase('bg-BG') ?? '').join('');
  return initials || 'F';
}

function formatFollowerCount(n: number): string {
  return n.toLocaleString('bg-BG');
}

function followerCountLabel(n: number): string {
  const formatted = formatFollowerCount(n);
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod10 === 1 && mod100 !== 11) {
    return `${formatted} последовател`;
  }
  return `${formatted} последователи`;
}

type HeaderHeroProps = {
  name: string;
  city?: string;
  verified?: boolean;
  coverUrl?: string | null;
  logoUrl?: string | null;
  initials: string;
};

const HeaderHero = memo(function HeaderHero({
  name,
  city,
  verified,
  coverUrl,
  logoUrl,
  initials,
}: HeaderHeroProps) {
  const hasCover = Boolean(coverUrl);
  const hasLogo = Boolean(logoUrl);

  return (
    <View style={styles.heroCard}>
      {hasCover && coverUrl ? (
        <>
          <ExpoImage
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            recyclingKey={coverUrl}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(17,24,39,0.08)', 'rgba(17,24,39,0.32)', 'rgba(17,24,39,0.74)']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTextOverlay}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitleImage} numberOfLines={2}>
                {name}
              </Text>
              {verified ? <VerifiedBadge compact /> : null}
            </View>
            {city ? (
              <View style={styles.heroCityPill}>
                <Ionicons name="location-outline" size={14} color="#FFFFFF" />
                <Text style={styles.heroCityText} numberOfLines={1}>
                  {city}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <LinearGradient colors={['#FDF2F8', '#EEF2FF', '#ECFDF5']} style={styles.coverFallback}>
          <View style={styles.avatarWrap}>
            {hasLogo && logoUrl ? (
              <ExpoImage
                source={{ uri: logoUrl }}
                style={styles.avatarImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={logoUrl}
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <View style={styles.fallbackTitleBlock}>
            <View style={styles.fallbackTitleRow}>
              <Text style={styles.heroTitleFallback} numberOfLines={2}>
                {name}
              </Text>
              {verified ? <VerifiedBadge compact /> : null}
            </View>
            {city ? (
              <View style={styles.fallbackCityRow}>
                <Ionicons name="location-outline" size={15} color={festivalUi.colors.secondary} />
                <Text style={styles.fallbackCityText} numberOfLines={1}>
                  {city}
                </Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      )}
    </View>
  );
});

export default function OrganizerProfileScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toggleSavedMutation = useToggleSavedMutation();
  const followMutation = useToggleOrganizerFollowMutation(slug);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['organizer', slug],
    queryFn: () => getOrganizerBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });

  const socialLinks = useMemo(() => {
    if (!data?.links) return [];
    return LINK_ORDER.reduce<OrganizerSocialLink[]>((acc, key) => {
      const value = data.links?.[key];
      if (typeof value !== 'string' || !value.trim()) return acc;
      const webUrl = normalizeExternalUrl(value);
      acc.push({
        key,
        url: webUrl,
        nativeUrl: buildNativeUrl(key, webUrl) ?? undefined,
        icon: LINK_ICONS[key],
        accessibilityLabel: LINK_LABELS[key],
      });
      return acc;
    }, []);
  }, [data?.links]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  const handleShare = useCallback(() => {
    if (!data) return;
    const url = getOrganizerPublicUrl(data.slug);
    const title = data.name.trim() || 'Организатор';
    if (!url) {
      Alert.alert('Споделяне', 'Липсва адрес на сайта. Задай EXPO_PUBLIC_SITE_URL или EXPO_PUBLIC_API_URL.');
      return;
    }
    const message = `${title}\n${url}`;
    void Share.share({ message });
  }, [data]);

  const onToggleFollow = useCallback(() => {
    if (!data?.organizerId) {
      Alert.alert('Следване', 'Липсва идентификатор на организатора.');
      return;
    }
    if (!user) {
      Alert.alert('Вход', 'Влез в профила си, за да следваш организатори.', [
        { text: 'Отказ', style: 'cancel' },
        { text: 'Вход', onPress: () => router.push('/login') },
      ]);
      return;
    }
    void Haptics.selectionAsync();
    followMutation.mutate(
      {
        organizerId: data.organizerId,
        following: Boolean(data.is_following),
      },
      {
        onError: (err) => {
          const m = err.message.toLowerCase();
          const isAuthError =
            m.includes('unauthorized') || m.includes('401') || m.includes('403');
          if (isAuthError) {
            Alert.alert(
              'Изтекла сесия',
              'Влез отново в профила си, за да следваш организатори.',
              [
                { text: 'Отказ', style: 'cancel' },
                { text: 'Вход', onPress: () => router.replace('/(auth)/login') },
              ],
            );
          } else {
            Alert.alert(
              'Неуспешно следване',
              'Нещо се обърка. Провери връзката и опитай отново.',
              [{ text: 'OK', style: 'cancel' }],
            );
          }
        },
      },
    );
  }, [data, followMutation, router, user]);

  const onToggleSave = useCallback(
    (item: FestivalListItem) => {
      const id = item.festivalId;
      setPendingIds((prev) => new Set(prev).add(id));
      toggleSavedMutation.mutate(
        { festivalId: item.festivalId, slug: item.slug, festival: item },
        {
          onSettled: () => {
            setPendingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          },
        },
      );
    },
    [toggleSavedMutation],
  );

  const listHeader = useMemo(() => {
    if (!data) return null;

    const description = data.description?.trim();
    const initials = getInitials(data.name);
    const followerLine =
      typeof data.followers_count === 'number'
        ? followerCountLabel(data.followers_count)
        : null;
    const festivalCount = data.festivals.length;
    const sectionSubtitle =
      festivalCount === 0
        ? 'Няма предстоящи събития в каталога'
        : festivalCount === 1
          ? '1 предстоящо събитие'
          : `${festivalCount} предстоящи събития`;

    return (
      <View>
        <View style={styles.headerRow}>
          <PressableScale
            onPress={() => router.back()}
            pressedScale={0.97}
            pressedOpacity={0.85}
            style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color={festivalUi.colors.text} />
            <Text style={styles.backLabel}>Назад</Text>
          </PressableScale>

          <View style={styles.headerActions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Сподели организатора"
              onPress={handleShare}
              pressedScale={0.95}
              pressedOpacity={0.85}
              style={styles.iconAction}>
              <Ionicons name="share-outline" size={20} color={festivalUi.colors.text} />
            </PressableScale>

            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={data.is_following ? 'Отследвай' : 'Следвай'}
              disabled={followMutation.isPending || !data.organizerId}
              onPress={onToggleFollow}
              pressedScale={0.97}
              pressedOpacity={0.9}
              style={[
                styles.followButton,
                data.is_following ? styles.followButtonActive : styles.followButtonInactive,
                (followMutation.isPending || !data.organizerId) && styles.followButtonDisabled,
              ]}>
              {followMutation.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={data.is_following ? festivalUi.colors.text : '#FFFFFF'}
                />
              ) : (
                <Reanimated.View
                  key={data.is_following ? 'following' : 'unfollowing'}
                  entering={FadeIn.duration(180)}
                  style={styles.followButtonInner}>
                  <Ionicons
                    name={data.is_following ? 'checkmark' : 'add'}
                    size={16}
                    color={data.is_following ? festivalUi.colors.text : '#FFFFFF'}
                  />
                  <Text
                    style={[
                      styles.followButtonText,
                      data.is_following ? styles.followButtonTextOutline : styles.followButtonTextFilled,
                    ]}
                    numberOfLines={1}>
                    {data.is_following ? 'Следваш' : 'Следвай'}
                  </Text>
                </Reanimated.View>
              )}
            </PressableScale>
          </View>
        </View>

        {followerLine ? (
          <AnimatedCount
            value={followerLine}
            style={styles.followerHint}
            numberOfLines={1}
          />
        ) : null}

        <Reanimated.View entering={FadeIn.duration(240)}>
          <HeaderHero
            name={data.name}
            city={data.city}
            verified={Boolean(data.verified)}
            coverUrl={data.cover_image_url}
            logoUrl={data.logo_url}
            initials={initials}
          />
        </Reanimated.View>

        <Reanimated.View
          style={styles.topSection}
          entering={FadeInDown.duration(260).delay(80)}>
          {description ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>За организатора</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
          ) : null}

          {socialLinks.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Връзки</Text>
              <OrganizerSocialIconRow links={socialLinks} />
            </View>
          ) : null}

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Събития от този организатор</Text>
            <Text style={styles.sectionSubtitle}>{sectionSubtitle}</Text>
          </View>
        </Reanimated.View>
      </View>
    );
  }, [
    data,
    followMutation.isPending,
    handleShare,
    onToggleFollow,
    router,
    socialLinks,
  ]);

  if (!slug) {
    return (
      <View style={[styles.centerFill, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.errorTitle}>Липсва организатор.</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Skeleton width={80} height={34} radius={skeletonRadii.pill} />
          <View style={styles.headerActionsGhost}>
            <Skeleton width={40} height={40} radius={skeletonRadii.pill} />
            <Skeleton width={118} height={40} radius={skeletonRadii.pill} />
          </View>
        </View>
        <View style={styles.heroSkeleton}>
          <Skeleton
            width={skeletonRhythm.thumbSmall + 18}
            height={skeletonRhythm.thumbSmall + 18}
            radius={(skeletonRhythm.thumbSmall + 18) / 2}
          />
          <Skeleton
            height={22}
            width={'70%'}
            radius={skeletonRadii.line}
            style={styles.heroLineSpaceWide}
          />
          <Skeleton
            height={skeletonRhythm.lineLg}
            width={'44%'}
            radius={skeletonRadii.line}
            style={styles.heroLineSpace}
          />
        </View>
        <View style={styles.blockPad}>
          <Skeleton height={skeletonRhythm.lineLg} width={'100%'} style={styles.skeletonLineSpace} />
          <Skeleton height={skeletonRhythm.lineLg} width={'72%'} style={styles.skeletonLineSpace} />
          <Skeleton height={skeletonRhythm.lineLg} width={'100%'} style={styles.skeletonLineSpace} />
        </View>
        <View style={[styles.infoSkeleton, { marginHorizontal: festivalUi.screenPadding }]}>
          <Skeleton height={18} width={'78%'} />
          <Skeleton height={skeletonRhythm.lineLg} width={'58%'} style={styles.heroLineSpace} />
          <Skeleton height={skeletonRhythm.lineLg} width={'38%'} style={styles.skeletonLineSpace} />
        </View>
        <Skeleton
          height={132}
          radius={skeletonRadii.card}
          style={[styles.cardSkeleton, { marginHorizontal: festivalUi.screenPadding }]}
        />
        <Skeleton
          height={132}
          radius={skeletonRadii.card}
          style={[styles.cardSkeleton, { marginHorizontal: festivalUi.screenPadding }]}
        />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.centerFill, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={festivalUi.colors.muted} style={styles.errorIcon} />
        <Text style={styles.errorTitle}>Не успяхме да заредим организатора.</Text>
        <Text style={styles.errorSubtitle}>Провери връзката и опитай отново.</Text>
        <OutlinedActionButton label="Опитай отново" onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      data={data.festivals}
      keyExtractor={(item) => item.festivalId}
      extraData={pendingIds}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 34,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={festivalUi.colors.text}
          colors={[festivalUi.colors.text]}
        />
      }
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <View style={styles.emptyIllustration}>
            <Ionicons name="calendar-outline" size={36} color={festivalUi.colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>Няма предстоящи фестивали</Text>
          <Text style={styles.emptySubtitle}>
            Когато този организатор публикува нови събития в Festivo, ще се появят тук.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.cardWrap}>
          <FestivalCard
            variant="compact"
            item={item}
            onPressCard={() => router.push(festivalDetailHref(item.slug))}
            onPressSave={() => onToggleSave(item)}
            saveDisabled={pendingIds.has(item.festivalId)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: festivalUi.screenPadding,
  },
  listContent: {
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    paddingHorizontal: festivalUi.screenPadding,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerActionsGhost: {
    flexDirection: 'row',
    gap: 8,
  },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    maxWidth: 148,
  },
  followButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  followButtonInactive: {
    backgroundColor: festivalUi.colors.buttonBg,
    borderColor: festivalUi.colors.buttonBg,
  },
  followButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },
  followButtonDisabled: {
    opacity: 0.55,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  followButtonTextFilled: {
    color: '#FFFFFF',
  },
  followButtonTextOutline: {
    color: festivalUi.colors.text,
  },
  followerHint: {
    marginHorizontal: festivalUi.screenPadding,
    marginTop: -2,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
    textAlign: 'right',
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  backLabel: {
    color: festivalUi.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  heroCard: {
    height: 244,
    marginHorizontal: festivalUi.screenPadding,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  heroTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    rowGap: 8,
  },
  heroTextOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  heroTitleImage: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
  },
  heroCityPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroCityText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: festivalUi.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  fallbackTitleBlock: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  fallbackTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    rowGap: 8,
    paddingHorizontal: 4,
    maxWidth: '100%',
  },
  heroTitleFallback: {
    flexShrink: 1,
    maxWidth: '90%',
    color: festivalUi.colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    textAlign: 'center',
  },
  fallbackCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  fallbackCityText: {
    color: festivalUi.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  topSection: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 16,
  },
  sectionBlock: {
    gap: 6,
    marginBottom: 4,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  description: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 25,
    color: '#374151',
  },
  sectionTitle: {
    color: festivalUi.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
  },
  cardWrap: {
    paddingHorizontal: festivalUi.screenPadding,
    marginBottom: 14,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: festivalUi.screenPadding,
    backgroundColor: '#FFFFFF',
  },
  errorIcon: {
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: festivalUi.colors.text,
    textAlign: 'center',
  },
  errorSubtitle: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 15,
    lineHeight: 22,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
  },
  emptyState: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingVertical: 28,
    alignItems: 'center',
    marginHorizontal: festivalUi.screenPadding,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  emptyIllustration: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: festivalUi.colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: festivalUi.colors.secondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  blockPad: {
    paddingHorizontal: festivalUi.screenPadding,
    marginTop: 8,
  },
  skeletonLineSpace: {
    marginTop: 10,
  },
  heroLineSpaceWide: {
    marginTop: 18,
  },
  heroLineSpace: {
    marginTop: 12,
  },
  heroSkeleton: {
    height: 244,
    marginHorizontal: festivalUi.screenPadding,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  infoSkeleton: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  cardSkeleton: {
    marginTop: 12,
  },
});
