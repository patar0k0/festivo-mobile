import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { InboxRequestError, fetchInboxPage, markInboxOpened, type InboxItem } from '@/lib/push/inbox';

type InboxStatus = 'loading' | 'ready' | 'error';
type InboxErrorCode = 'none' | 'network' | 'unauthorized' | 'invalid_payload';

class InboxRenderBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // keep inbox screen resilient against render failures
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Не успяхме да покажем известията</Text>
          <Text style={styles.emptyBody}>Опитай отново след малко.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function groupLabel(createdAt: string): 'Today' | 'Yesterday' | 'Earlier' {
  const now = new Date();
  const d = new Date(createdAt);
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return 'Earlier';
}

export default function ProfileInboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<InboxStatus>('loading');
  const [errorCode, setErrorCode] = useState<InboxErrorCode>('none');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeRequestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const clearActiveRequest = useCallback(() => {
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  useEffect(() => () => clearActiveRequest(), [clearActiveRequest]);

  const resolveErrorCode = (err: unknown): InboxErrorCode => {
    if (err instanceof InboxRequestError) return err.code;
    return 'network';
  };

  const loadInitial = useCallback(async () => {
    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;
    clearActiveRequest();
    const controller = new AbortController();
    activeController.current = controller;
    setStatus('loading');
    setErrorCode('none');
    try {
      const page = await fetchInboxPage(null, 20, controller.signal);
      if (activeRequestId.current !== requestId) return;
      setItems(page.items);
      setCursor(page.pageInfo.nextCursor);
      setHasMore(page.pageInfo.hasMore);
      setStatus('ready');
      setErrorCode('none');
    } catch (err) {
      if (controller.signal.aborted || activeRequestId.current !== requestId) return;
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setStatus('error');
      setErrorCode(resolveErrorCode(err));
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
      }
    }
  }, [clearActiveRequest]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  const onLoadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchInboxPage(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.pageInfo.nextCursor);
      setHasMore(page.pageInfo.hasMore);
    } catch (err) {
      const code = resolveErrorCode(err);
      if (code === 'unauthorized') {
        setStatus('error');
        setErrorCode('unauthorized');
      }
      setHasMore(false);
      setCursor(null);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore]);

  const grouped = useMemo(() => {
    const buckets: Record<string, InboxItem[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const item of items) {
      buckets[groupLabel(item.createdAt)].push(item);
    }
    return buckets;
  }, [items]);

  const openItem = useCallback(
    (item: InboxItem) => {
      void markInboxOpened(item.notificationId);
      if (item.deepLink?.includes('festival/')) {
        const slug = item.deepLink.split('festival/')[1]?.split(/[?#]/)[0];
        if (slug) {
          router.push(festivalDetailHref(decodeURIComponent(slug)));
          return;
        }
      }
      router.push('/notification-fallback');
    },
    [router],
  );

  if (status === 'loading') {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator />
        <Text style={styles.skeletonText}>Зареждаме известия…</Text>
      </View>
    );
  }

  const empty = items.length === 0 && status === 'ready';
  const errorMessage =
    errorCode === 'unauthorized'
      ? 'Сесията ти е изтекла. Влез отново и пробвай пак.'
      : errorCode === 'invalid_payload'
        ? 'Получихме невалидни данни. Опитай отново след малко.'
        : 'Възникна проблем при зареждане на входящите известия.';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: 12, paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {status === 'error' ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Не успяхме да заредим</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void loadInitial()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Опитай отново</Text>
          </Pressable>
        </View>
      ) : null}

      {empty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Нямаш известия</Text>
          <Text style={styles.emptyBody}>Когато изпратим push известие, ще се покаже тук.</Text>
        </View>
      ) : null}

      <InboxRenderBoundary>
        {(['Today', 'Yesterday', 'Earlier'] as const).map((group) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            {grouped[group].map((item) => (
              <Pressable key={item.id} style={styles.card} onPress={() => openItem(item)} accessibilityRole="button">
                <View style={styles.row}>
                  {item.unread ? <View style={styles.unreadDot} /> : <View style={styles.readDot} />}
                  <View style={styles.textCol}>
                    <Text style={styles.summary} numberOfLines={2}>
                      {item.summary}
                    </Text>
                    <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString('bg-BG')}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </InboxRenderBoundary>

      {hasMore && status !== 'error' ? (
        <Pressable style={styles.loadMore} onPress={onLoadMore} disabled={loadingMore} accessibilityRole="button">
          <Text style={styles.loadMoreText}>{loadingMore ? 'Зареждане…' : 'Покажи още'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F4F5F8' },
  skeletonText: { color: '#6B7280', fontSize: 14 },
  scroll: { flex: 1, backgroundColor: '#F4F5F8' },
  content: { paddingHorizontal: 16, gap: 14 },
  empty: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyBody: { marginTop: 6, fontSize: 14, color: '#6B7280' },
  errorCard: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', gap: 8 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#991B1B' },
  errorBody: { fontSize: 14, color: '#B91C1C' },
  retryBtn: { alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#B91C1C', paddingHorizontal: 12, paddingVertical: 8 },
  retryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F46E5', marginTop: 6 },
  readDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB', marginTop: 6 },
  textCol: { flex: 1 },
  summary: { fontSize: 14, lineHeight: 20, color: '#111827', fontWeight: '600' },
  meta: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  loadMore: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  loadMoreText: { color: '#4F46E5', fontWeight: '700' },
});
