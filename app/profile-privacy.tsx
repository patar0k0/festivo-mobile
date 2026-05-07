import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { getPrivacyPolicyUrl } from '@/lib/site';

export default function ProfilePrivacyScreen() {
  const insets = useSafeAreaInsets();
  const privacyUrl = getPrivacyPolicyUrl();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 12, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled>
      <Text style={styles.p}>
        Пазим личните ти данни според приложимото законодателство. Пълният текст на политиката за поверителност е
        публикуван на сайта на Festivo.
      </Text>
      {privacyUrl ? (
        <OutlinedActionButton
          label="Отвори политиката в браузър"
          onPress={() => {
            void (async () => {
              try {
                await WebBrowser.openBrowserAsync(privacyUrl, {
                  enableBarCollapsing: true,
                  showInRecents: true,
                });
              } catch {
                try {
                  const can = await Linking.canOpenURL(privacyUrl);
                  if (can) {
                    await Linking.openURL(privacyUrl);
                  } else {
                    Alert.alert('Грешка', 'Не може да се отвори външен браузър на това устройство.');
                  }
                } catch {
                  Alert.alert('Грешка', 'Неуспешно отваряне на политиката за поверителност.');
                }
              }
            })();
          }}
        />
      ) : (
        <View style={styles.missingUrl}>
          <Text style={styles.missingUrlText}>
            Задай EXPO_PUBLIC_SITE_URL или валиден EXPO_PUBLIC_API_URL, за да се отвори /privacy автоматично.
          </Text>
        </View>
      )}
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
    gap: 16,
  },
  p: {
    fontSize: 16,
    lineHeight: 24,
    color: festivalUi.colors.text,
  },
  missingUrl: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  missingUrlText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#9A3412',
  },
});
