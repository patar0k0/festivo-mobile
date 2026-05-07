import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type OrganizerSocialLink = {
  key: string;
  url: string;
  icon: IoniconName;
  accessibilityLabel: string;
};

type Props = {
  links: OrganizerSocialLink[];
};

export function OrganizerSocialIconRow({ links }: Props) {
  if (links.length === 0) return null;

  return (
    <View style={styles.row} accessibilityRole="list">
      {links.map((link) => (
        <PressableScale
          key={link.key}
          accessibilityRole="button"
          accessibilityLabel={link.accessibilityLabel}
          onPress={() => {
            void Linking.openURL(link.url);
          }}
          pressedScale={0.94}
          pressedOpacity={0.85}
          style={styles.chip}>
          <Ionicons name={link.icon} size={22} color={festivalUi.colors.text} />
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  chip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});
