import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { FestivalSaveButton, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { getFestival } from '@/lib/api/festivals';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

const DESCRIPTION_PREVIEW_CHARS = 220;

const HERO_PALETTE = ['#4F46E5', '#0EA5E9', '#059669', '#D97706', '#7C3AED', '#DB2777'];

function heroFallbackColor(slug: string): string {
  let sum = 0;
  for (let i = 0; i < slug.length; i += 1) {
    sum += slug.charCodeAt(i) * (i + 1);
  }
  return HERO_PALETTE[Math.abs(sum) % HERO_PALETTE.length];
}

function InfoRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  if (!value) return null;
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function FestivalDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const toggleSavedMutation = useToggleSavedMutation();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['festival', slug],
    queryFn: () => getFestival(slug ?? ''),
    enabled: Boolean(slug),
  });

  /** When the API exposes image URLs on the detail payload, map them here; empty hides the gallery section. */
  const galleryImages: string[] = [];

  // No cover URL on FestivalDetail yet — hero uses a colored fallback; set when the response includes an image field.
  const coverUri: string | undefined = undefined;

  const toggleDescriptionExpanded = () => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDescriptionExpanded((v) => !v);
  };

  if (!slug) {
    return (
      <View style={styles.screenContent}>
        <Text style={styles.bodyText}>Missing festival</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={styles.root}>
        <View style={[styles.hero, styles.heroSkeleton]} />
        <View style={styles.ctaBar}>
          <FestivalSaveButton label="Save festival" onPress={() => {}} disabled />
        </View>
        <View style={styles.screenContent}>
          <Text style={[festivalUi.typography.secondary, styles.loadingText]}>Loading festival details...</Text>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '70%' }]} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.screenContent}>
        <FestivalSaveButton label="Save festival" onPress={() => {}} disabled />
        <Text style={styles.bodyText}>We could not load this festival right now.</Text>
        <Text style={[festivalUi.typography.secondary, styles.subText]}>Please try again.</Text>
        <OutlinedActionButton label="Try again" onPress={() => refetch()} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.screenContent}>
        <Text style={styles.bodyText}>Festival details are not available.</Text>
      </View>
    );
  }

  const datesText = [data.start_date, data.end_date].filter(Boolean).join(' — ');
  const saveLabel = data.saved ? 'Remove from saved' : 'Save festival';
  const description = data.description ?? '';
  const needsDescriptionToggle = description.length > DESCRIPTION_PREVIEW_CHARS;
  const descriptionShown =
    descriptionExpanded || !needsDescriptionToggle
      ? description
      : `${description.slice(0, DESCRIPTION_PREVIEW_CHARS).trim()}…`;

  const infoRows = [
    { label: 'Location', value: data.city },
    { label: 'Dates', value: datesText || data.start_date },
  ].filter((row) => row.value);

  return (
    <View style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentBottom}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: heroFallbackColor(data.slug) }]} />
          )}
        </View>

        {/* CTA near top */}
        <View style={styles.ctaBar}>
          <FestivalSaveButton
            label={saveLabel}
            onPress={() =>
              toggleSavedMutation.mutate({
                festivalId: data.festivalId,
                slug: data.slug,
                festival: data,
              })
            }
          />
        </View>

        {/* Title block */}
        <View style={styles.blockPad}>
          <Text style={styles.detailTitle}>{data.title}</Text>
          <Text style={[festivalUi.typography.secondary, styles.city]}>{data.city}</Text>
          <Text style={[festivalUi.typography.muted, styles.dates]}>{datesText || data.start_date}</Text>
        </View>

        {/* Info */}
        {infoRows.length > 0 ? (
          <View style={styles.blockPad}>
            <Text style={styles.sectionHeading}>Details</Text>
            <View style={styles.infoCard}>
              {infoRows.map((row, index) => (
                <InfoRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  isLast={index === infoRows.length - 1}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Description */}
        {description.length > 0 ? (
          <View style={styles.blockPad}>
            <Text style={styles.sectionHeading}>About</Text>
            <Text style={styles.description}>{descriptionShown}</Text>
            {needsDescriptionToggle ? (
              <Pressable onPress={toggleDescriptionExpanded} style={styles.textLinkWrap}>
                <Text style={styles.textLink}>{descriptionExpanded ? 'Show less' : 'Read more'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Gallery */}
        {galleryImages.length > 0 ? (
          <View style={styles.gallerySection}>
            <Text style={[styles.sectionHeading, styles.galleryHeadingPad]}>Gallery</Text>
            <FlatList
              horizontal
              data={galleryImages}
              keyExtractor={(uri, index) => `${uri}-${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryListContent}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item: uri }) => (
                <Image source={{ uri }} style={styles.galleryThumb} contentFit="cover" />
              )}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  heroWrap: {
    width: '100%',
  },
  hero: {
    width: '100%',
    height: 240,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroFallback: {
    width: '100%',
    height: 240,
  },
  heroSkeleton: {
    backgroundColor: '#E5E7EB',
  },
  ctaBar: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  blockPad: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 20,
  },
  scrollContentBottom: {
    paddingBottom: 40,
  },
  screenContent: {
    flex: 1,
    padding: festivalUi.screenPadding,
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: festivalUi.colors.text,
    lineHeight: 32,
  },
  city: {
    marginTop: 10,
    fontSize: 16,
  },
  dates: {
    marginTop: 6,
    fontSize: 15,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: festivalUi.colors.text,
    marginBottom: 12,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  infoRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: festivalUi.typography.muted.color,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: festivalUi.colors.text,
    lineHeight: 22,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  textLinkWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  textLink: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  gallerySection: {
    marginTop: 8,
    paddingBottom: 8,
  },
  galleryHeadingPad: {
    paddingHorizontal: festivalUi.screenPadding,
  },
  galleryListContent: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 4,
    paddingBottom: 8,
  },
  galleryThumb: {
    width: 160,
    height: 112,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  bodyText: {
    fontSize: 16,
    color: festivalUi.colors.text,
    fontWeight: '500',
  },
  subText: {
    marginTop: 6,
  },
  loadingText: {
    marginTop: 8,
    marginBottom: 16,
  },
  skeletonTitle: {
    height: 28,
    width: '85%',
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  skeletonLine: {
    height: 14,
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
});
