import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { FestivalCard, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { getSavedFestivals } from '@/lib/api/saved';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

export default function SavedScreen() {
  const router = useRouter();
  const toggleSavedMutation = useToggleSavedMutation();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['savedFestivals'],
    queryFn: () => getSavedFestivals(),
  });

  if (isPending) {
    return (
      <View style={styles.screenContent}>
        <Text style={[festivalUi.typography.secondary, styles.loadingTitle]}>Loading saved festivals...</Text>
        <View style={styles.skeletonCard} />
        <View style={[styles.skeletonCard, styles.skeletonSpacer]} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.screenContent}>
        <Text style={styles.bodyText}>We could not load your saved festivals.</Text>
        <Text style={[festivalUi.typography.secondary, styles.subText]}>Please try again.</Text>
        <OutlinedActionButton label="Try again" onPress={() => refetch()} />
      </View>
    );
  }

  if (!data?.length) {
    return (
      <View style={styles.screenContent}>
        <Text style={festivalUi.typography.sectionTitle}>Saved</Text>
        <Text style={[styles.bodyText, styles.emptyTitle]}>No saved festivals yet</Text>
        <Text style={[festivalUi.typography.secondary, styles.subText]}>
          Tap Remind me on any event to keep it here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.slug}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={{ height: festivalUi.cardGap }} />}
      ListHeaderComponent={
        <Text style={[festivalUi.typography.sectionTitle, styles.listHeader]}>Saved</Text>
      }
      renderItem={({ item }) => (
        <FestivalCard
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: festivalUi.screenPadding,
  },
  listContent: {
    padding: festivalUi.screenPadding,
    paddingBottom: 32,
  },
  listHeader: {
    marginBottom: 16,
  },
  loadingTitle: {
    marginBottom: 16,
  },
  skeletonCard: {
    height: 140,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  skeletonSpacer: {
    marginTop: 12,
  },
  bodyText: {
    fontSize: 16,
    color: festivalUi.colors.text,
    fontWeight: '500',
  },
  emptyTitle: {
    marginTop: 8,
  },
  subText: {
    marginTop: 6,
  },
});
