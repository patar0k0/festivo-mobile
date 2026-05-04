import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { getFestival } from '@/lib/api/festivals';

export default function FestivalDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['festival', slug],
    queryFn: () => getFestival(slug ?? ''),
    enabled: Boolean(slug),
  });

  if (!slug) {
    return (
      <View>
        <Text>Missing festival</Text>
      </View>
    );
  }

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

  if (!data) {
    return (
      <View>
        <Text>No data</Text>
      </View>
    );
  }

  const datesText = [data.start_date, data.end_date].filter(Boolean).join(' — ');

  return (
    <View>
      <Text>{data.title}</Text>
      <Text>{data.description}</Text>
      <Text>{data.city}</Text>
      <Text>{datesText || data.start_date}</Text>
    </View>
  );
}
