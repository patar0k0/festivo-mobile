import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';

type SearchSectionProps = {
  title: string;
  children: ReactNode;
};

export function SearchSection({ title, children }: SearchSectionProps) {
  return (
    <View style={styles.block}>
      <Text style={[festivalUi.typography.sectionTitle, styles.title]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: festivalUi.sectionGap,
  },
  title: {
    marginBottom: 12,
  },
});
