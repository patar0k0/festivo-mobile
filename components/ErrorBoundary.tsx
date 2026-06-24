import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captureError } from '@/lib/observability/sentry';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    captureError(error, { componentStack: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>Нещо се обърка</Text>
          <Text style={styles.body}>Рестартирай приложението. Грешката е докладвана.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 14, color: '#64748B', textAlign: 'center' },
});
