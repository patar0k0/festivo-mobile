import { StyleSheet, Text, View } from 'react-native';

export default function FestivalsMapScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Картата не се поддържа в браузър</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    color: '#6B7280',
  },
});
