import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { getFestivals } from '@/lib/api/festivals';

export default function Index() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => getFestivals(),
  });

  if (isPending) {
    return (
      <View>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View>
        <Text>{error instanceof Error ? error.message : 'Error'}</Text>
        <Pressable onPress={() => refetch()}>
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!data?.length) {
    return (
      <View>
        <Text>No festivals</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.slug}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/festival/${item.slug}`)}>
          <Text>{item.title}</Text>
          <Text>{item.city}</Text>
          <Text>{item.start_date}</Text>
        </Pressable>
      )}
    />
  );
}
