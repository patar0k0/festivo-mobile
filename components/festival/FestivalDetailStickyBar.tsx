import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';

type Props = {
  saved: boolean;
  saveBusy: boolean;
  onSave: () => void;
};

export const FestivalDetailStickyBar = memo(function FestivalDetailStickyBar({
  saved,
  saveBusy,
  onSave,
}: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.inner}>
        <PressableScale
          onPress={onSave}
          disabled={saveBusy}
          pressedScale={0.97}
          pressedOpacity={0.88}
          style={[styles.btn, saved && styles.btnSaved]}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Премахни от плана' : 'Добави в плана'}>
          {saveBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name={saved ? 'checkmark-circle' : 'add-circle-outline'}
              size={22}
              color="#FFFFFF"
            />
          )}
          <Text style={styles.btnLabel} numberOfLines={1}>
            {saved ? 'В плана' : 'Добави в плана'}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 9,
      },
    }),
  },
  inner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: festivalUi.colors.buttonBg,
    ...Platform.select({
      ios: {
        shadowColor: festivalUi.colors.buttonBg,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  btnSaved: {
    backgroundColor: '#059669',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOpacity: 0.3,
      },
    }),
  },
  btnLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
