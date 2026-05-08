import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Skeleton } from "@/components/ui/Skeleton";
import { followOrganizer, unfollowOrganizer } from "@/lib/api/organizerFollow";
import { getFollowFeed, type FollowFeedItem, type FollowFeedPage } from "@/lib/api/followFeed";
import { trackEvent } from "@/lib/analytics/track";

function ProofPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

function FollowCard({
  item,
  onOpenFestival,
  onOpenOrganizer,
}: {
  item: FollowFeedItem;
  onOpenFestival: (slug: string, explanationCode: string) => void;
  onOpenOrganizer: (slug: string) => void;
}) {
  if (!item.festival) return null;
  const title = item.festival.title;
  const city = item.festival.city || "България";
  const proof = item.social_proof;
  return (
    <Pressable
      onPress={() => onOpenFestival(item.festival!.slug, item.explanation.code)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.badgeWrap}>
        <Text style={styles.badge}>{item.explanation.label_bg || item.explanation.label}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {city}
      </Text>
      <View style={styles.pillsRow}>
        {typeof proof?.save_count === "number" && proof.save_count > 0 ? (
          <ProofPill
            label={`${proof.save_count} saved`}
            onPress={() => {
              void trackEvent({
                event: "proof_pill_click",
                festival_id: item.festival!.festivalId,
                slug: item.festival!.slug,
                source: "following_feed",
                metadata: { pill: "save_count" },
              });
            }}
          />
        ) : null}
        {typeof proof?.weekly_views === "number" && proof.weekly_views > 0 ? (
          <ProofPill
            label="Trending this week"
            onPress={() => {
              void trackEvent({
                event: "proof_pill_click",
                festival_id: item.festival!.festivalId,
                slug: item.festival!.slug,
                source: "following_feed",
                metadata: { pill: "weekly_views" },
              });
            }}
          />
        ) : null}
      </View>
      {item.activity_type === "new_festival" && item.social_proof?.organizer_follower_count ? (
        <Pressable
          onPress={() => item.organizer?.slug && onOpenOrganizer(item.organizer.slug)}
          style={({ pressed }) => [styles.organizerRow, pressed && styles.organizerRowPressed]}
        >
          <Ionicons name="people-outline" size={14} color="#374151" />
          <Text style={styles.organizerMeta}>
            {item.social_proof.organizer_follower_count} followers
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function FollowingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [followStateByOrganizer, setFollowStateByOrganizer] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void trackEvent({ event: "follow_feed_open", source: "following_tab" });
  }, []);

  const feedQuery = useInfiniteQuery<FollowFeedPage>({
    queryKey: ["feed", "following"],
    queryFn: ({ pageParam }) => getFollowFeed((pageParam as string | null | undefined) ?? null, 12),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: null as string | null,
    staleTime: 120_000,
  });

  const toggleFollowMutation = useMutation({
    mutationFn: async ({ organizerId, following }: { organizerId: string; following: boolean }) => {
      if (following) await unfollowOrganizer(organizerId);
      else await followOrganizer(organizerId);
    },
  });

  const items = useMemo(
    () => (feedQuery.data?.pages ?? []).flatMap((page) => page.items).filter((item) => item.festival != null),
    [feedQuery.data?.pages],
  );
  const groups = useMemo(
    () => (feedQuery.data?.pages ?? []).flatMap((page) => page.organizers),
    [feedQuery.data?.pages],
  );

  const onRefresh = useCallback(() => {
    void feedQuery.refetch();
  }, [feedQuery]);

  const onOpenFestival = useCallback((slug: string, explanationCode: string) => {
    void trackEvent({
      event: "follow_feed_card_click",
      slug,
      source: "following_feed",
      metadata: { explanation_code: explanationCode },
    });
    void trackEvent({
      event: "recommendation_explanation_click",
      slug,
      source: "following_feed",
      metadata: { explanation_code: explanationCode },
    });
    router.push(`/festival/${slug}`);
  }, [router]);

  const onOpenOrganizer = useCallback((organizerId: string) => {
    if (!organizerId) return;
    router.push(`/organizer/${organizerId}`);
  }, [router]);

  const toggleFollow = useCallback((organizerId: string) => {
    const current = followStateByOrganizer[organizerId] ?? true;
    setFollowStateByOrganizer((prev) => ({ ...prev, [organizerId]: !current }));
    toggleFollowMutation.mutate(
      { organizerId, following: current },
      {
        onError: () => {
          setFollowStateByOrganizer((prev) => ({ ...prev, [organizerId]: current }));
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
        },
      },
    );
  }, [followStateByOrganizer, queryClient, toggleFollowMutation]);

  if (feedQuery.isLoading && items.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <Skeleton height={96} radius={14} />
        <Skeleton height={96} radius={14} />
        <Skeleton height={96} radius={14} />
      </View>
    );
  }

  if (items.length === 0 && !feedQuery.isFetching) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="sparkles-outline" size={42} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Все още няма активности</Text>
        <Text style={styles.emptySub}>Последвайте организатори, за да получите персонализиран feed.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `${item.activity_type}:${item.festival?.festivalId}`}
      refreshControl={<RefreshControl refreshing={feedQuery.isRefetching} onRefresh={onRefresh} />}
      contentContainerStyle={styles.listContent}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
          void feedQuery.fetchNextPage();
        }
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Following</Text>
          <Text style={styles.headerSub}>Защото следвате организатори и интереси</Text>
          <View style={styles.groupsWrap}>
            {groups.slice(0, 6).map((group) => {
              const state = followStateByOrganizer[group.organizer_id] ?? true;
              return (
                <View
                  key={group.organizer_id || `group:${group.organizer_name}`}
                  style={styles.groupChip}
                >
                  <Pressable
                    style={({ pressed }) => [styles.groupChipLeft, pressed && styles.groupChipPressed]}
                    onPress={() => group.organizer_slug && onOpenOrganizer(group.organizer_slug)}
                  >
                    <Text style={styles.groupChipText} numberOfLines={1}>
                      {group.organizer_name ?? "Organizer"} · {group.item_count}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => group.organizer_id && toggleFollow(group.organizer_id)}>
                    <Text style={styles.groupChipAction}>{state ? "Following" : "Follow"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <FollowCard item={item} onOpenFestival={onOpenFestival} onOpenOrganizer={onOpenOrganizer} />
      )}
      ListFooterComponent={
        feedQuery.isFetchingNextPage ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator size="small" color="#111827" />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 14, paddingBottom: 42 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#111827" },
  headerSub: { marginTop: 4, fontSize: 14, color: "#6B7280" },
  groupsWrap: { marginTop: 12, gap: 8 },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  groupChipLeft: {
    flex: 1,
  },
  groupChipPressed: { opacity: 0.75 },
  groupChipText: { flex: 1, color: "#111827", fontWeight: "600" },
  groupChipAction: { color: "#4F46E5", fontWeight: "700", marginLeft: 10 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  badgeWrap: { alignSelf: "flex-start", marginBottom: 8 },
  badge: {
    fontSize: 12,
    color: "#4338CA",
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "700",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },
  meta: { marginTop: 6, fontSize: 13, color: "#6B7280" },
  pillsRow: { marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillPressed: { opacity: 0.7 },
  pillText: { fontSize: 12, color: "#374151", fontWeight: "600" },
  organizerRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  organizerRowPressed: { opacity: 0.7 },
  organizerMeta: { fontSize: 12, color: "#374151", fontWeight: "600" },
  loadingWrap: { flex: 1, padding: 14, gap: 10 },
  footerLoading: { paddingVertical: 14 },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: "800", color: "#111827" },
  emptySub: { marginTop: 6, textAlign: "center", fontSize: 14, color: "#6B7280" },
});
