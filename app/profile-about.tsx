import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi } from '@/components/ui/FestivalCard';

export default function ProfileAboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 12, paddingBottom: insets.bottom + 24 },
      ]}>
      <Text style={styles.p}>
        Festivo е приложение за откриване и планиране на фестивали и събития в България. Версия 1.0.0.
      </Text>
      <Text style={styles.p}>
        Можеш да запазваш любими фестивали, да получаваш напомняния и да следиш програми на едно място.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F4F5F8',
  },
  content: {
    paddingHorizontal: festivalUi.screenPadding,
    gap: 14,
  },
  p: {
    fontSize: 16,
    lineHeight: 24,
    color: festivalUi.colors.text,
  },
});
