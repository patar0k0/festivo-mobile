import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivals } from '@/lib/api/festivals';
import {
  FestivalCard,
  FeaturedFestivalCard,
  FestivalSectionTitle,
  festivalUi,
  OutlinedActionButton,
} from '@/components/ui/FestivalCard';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function thisWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

function SectionLoadingState() {
  return (
    <View>
      <Text style={[festivalUi.typography.secondary, styles.loadingLabel]}>Loading festivals...</Text>
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
      </View>
    </View>
  );
}

export default function Index() {
  const router = useRouter();
  const toggleSavedMutation = useToggleSavedMutation();
  const { startDate, endDate } = thisWeekRange();

  const popularQuery = useQuery({
    queryKey: ['festivals', 'popular'],
    queryFn: () => getFestivals({ limit: 10 }),
  });

  const thisWeekQuery = useQuery({
    queryKey: ['festivals', 'this-week'],
    queryFn: () => getFestivals({ startDate, endDate }),
  });

  if (popularQuery.isPending || thisWeekQuery.isPending) {
    return (
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.section}>
          <FestivalSectionTitle>Popular</FestivalSectionTitle>
          <SectionLoadingState />
        </View>
        <View style={styles.section}>
          <FestivalSectionTitle>This week</FestivalSectionTitle>
          <SectionLoadingState />
        </View>
        <View style={styles.section}>
          <FestivalSectionTitle>Nearby</FestivalSectionTitle>
          <SectionLoadingState />
        </View>
      </ScrollView>
    );
  }

  if (popularQuery.isError || thisWeekQuery.isError) {
    return (
      <View style={styles.screenContent}>
        <Text style={styles.bodyText}>We could not load festivals right now.</Text>
        <Text style={[festivalUi.typography.secondary, styles.subText]}>Please try again.</Text>
        <OutlinedActionButton
          label="Try again"
          onPress={() => {
            popularQuery.refetch();
            thisWeekQuery.refetch();
          }}
        />
      </View>
    );
  }

  const popular = popularQuery.data ?? [];
  const thisWeek = thisWeekQuery.data ?? [];
  const nearby = popular;

  if (!popular.length && !thisWeek.length) {
    return (
      <View style={styles.screenContent}>
        <Text style={styles.bodyText}>API EMPTY</Text>
      </View>
    );
  }

  const renderFestivalItem = ({ item }: { item: FestivalListItem }) => (
    <FestivalCard
      variant="carousel"
      item={item}
      onPressCard={() => router.push(`/festival/${item.slug}`)}
      onPressSave={() =>
        toggleSavedMutation.mutate({
          festivalId: item.festivalId,
          slug: item.slug,
          festival: item,
        })
      }
    />
  );

  const renderSection = (
    title: string,
    data: FestivalListItem[],
    emptyText: string,
    withFeaturedFirst = false
  ) => (
    <View style={styles.section}>
      <FestivalSectionTitle>{title}</FestivalSectionTitle>
      {data.length ? (
        <>
          {withFeaturedFirst ? (
            <View style={styles.featuredWrap}>
              <FeaturedFestivalCard
                item={data[0]}
                onPressCard={() => router.push(`/festival/${data[0].slug}`)}
                onPressSave={() =>
                  toggleSavedMutation.mutate({
                    festivalId: data[0].festivalId,
                    slug: data[0].slug,
                    festival: data[0],
                  })
                }
              />
            </View>
          ) : null}
          {withFeaturedFirst && data.length === 1 ? null : (
            <FlatList
              data={withFeaturedFirst ? data.slice(1) : data}
              horizontal
              keyExtractor={(item) => item.slug}
              renderItem={renderFestivalItem}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: festivalUi.cardGap }} />}
            />
          )}
        </>
      ) : (
        <Text style={festivalUi.typography.secondary}>{emptyText}</Text>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      {renderSection('Popular', popular, 'No popular festivals right now', true)}
      {renderSection('This week', thisWeek, 'No events this week', true)}
      {renderSection('Nearby', nearby, 'Nearby festivals are not available yet')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: festivalUi.screenPadding,
    paddingBottom: 32,
  },
  section: {
    marginBottom: festivalUi.sectionGap,
  },
  featuredWrap: {
    marginBottom: 18,
  },
  loadingLabel: {
    marginBottom: 10,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonCard: {
    width: 200,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bodyText: {
    fontSize: 16,
    color: festivalUi.colors.text,
    fontWeight: '500',
  },
  subText: {
    marginTop: 6,
  },
});
