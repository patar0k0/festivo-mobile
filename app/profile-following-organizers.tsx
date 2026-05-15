import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getFollowedOrganizers, type FollowedOrganizerItem } from '@/lib/api/followedOrganizers';
import { unfollowOrganizer } from '@/lib/api/organizerFollow';
import { festivalUi } from '@/components/ui/FestivalCard';

function OrganizerAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.avatar}>
      {logoUrl ? (
        <ExpoImage
          source={{ uri: logoUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={styles.avatarInitials}>{initials || '?'}</Text>
      )}
    </View>
  );
}

function OrganizerRow({
  item,
  unfollowing,
  onPress,
  onUnfollow,
}: {
  item: FollowedOrganizerItem;
  unfollowing: boolean;
  onPress: () => void;
  onUnfollow: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <OrganizerAvatar name={item.name} logoUrl={item.logo_url} />
      <Text style={styles.rowName} numberOfLines={2}>
        {item.name}
      </Text>
      <Pressable
        onPress={onUnfollow}
        disabled={unfollowing}
        hitSlop={12}
        style={({ pressed }) => [styles.unfollowBtn, pressed && !unfollowing && styles.unfollowBtnPressed]}>
        {unfollowing ? (
          <ActivityIndicator size="small" color="#DC2626" />
        ) : (
          <Text style={styles.unfollowLabel}>Отпиши се</Text>
        )}
      </Pressable>
    </Pressable>
  );
}

export default function ProfileFollowingOrganizersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unfollowingIds, setUnfollowingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['followedOrganizers'],
    queryFn: getFollowedOrganizers,
    staleTime: 30_000,
  });

  const unfollowMutation = useMutation({
    mutationFn: (organizerId: string) => unfollowOrganizer(organizerId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['followedOrganizers'] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
    },
  });

  const handleUnfollow = useCallback(
    (item: FollowedOrganizerItem) => {
      Alert.alert(
        'Отписване',
        `Да спрем ли да следим „${item.name}"? Няма да получавате повече известия за техните фестивали.`,
        [
          { text: 'Отказ', style: 'cancel' },
          {
            text: 'Отпиши се',
            style: 'destructive',
            onPress: () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setUnfollowingIds((prev) => new Set(prev).add(item.organizerId));
              unfollowMutation.mutate(item.organizerId, {
                onSettled: () => {
                  setUnfollowingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(item.organizerId);
                    return next;
                  });
                },
              });
            },
          },
        ],
      );
    },
    [unfollowMutation],
  );

  const handleOpenOrganizer = useCallback(
    (slug: string) => {
      router.push(`/organizer/${slug}`);
    },
    [router],
  );

  const organizers = query.data ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={26} color={festivalUi.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Следвани организатори</Text>
      </View>

      {query.isPending ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={festivalUi.colors.text} />
        </View>
      ) : query.isError ? (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Нещо се обърка</Text>
          <Pressable onPress={() => void query.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryLabel}>Опитай пак</Text>
          </Pressable>
        </View>
      ) : organizers.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons name="people-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Не следвате организатори</Text>
          <Text style={styles.emptySub}>
            Отворете профила на организатор и натиснете „Следвай", за да получавате известия за новите им
            фестивали.
          </Text>
        </View>
      ) : (
        <FlatList
          data={organizers}
          keyExtractor={(item) => item.organizerId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <OrganizerRow
              item={item}
              unfollowing={unfollowingIds.has(item.organizerId)}
              onPress={() => handleOpenOrganizer(item.slug)}
              onUnfollow={() => handleUnfollow(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  backBtnPressed: {
    backgroundColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: festivalUi.colors.text,
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: festivalUi.colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  list: {
    paddingTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 72,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: '#F9FAFB',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  unfollowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFFFF',
    minWidth: 88,
    alignItems: 'center',
  },
  unfollowBtnPressed: {
    backgroundColor: '#FEF2F2',
  },
  unfollowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
});
