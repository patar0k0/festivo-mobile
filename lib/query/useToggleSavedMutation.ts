import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { toggleSaved } from '@/lib/api/saved';

type ToggleSavedInput = {
  festivalId: string;
  slug?: string;
  festival?: FestivalListItem | FestivalDetail;
};

type ToggleSavedContext = {
  festivalQuerySnapshots?: Array<{ queryKey: QueryKey; data: FestivalListItem[] }>;
  savedFestivals?: FestivalListItem[];
  festivalDetail?: FestivalDetail;
  slug?: string;
};

function matchesFestival(
  item: Pick<FestivalListItem, 'festivalId' | 'slug'>,
  input: Pick<ToggleSavedInput, 'festivalId' | 'slug'>
): boolean {
  return item.festivalId === input.festivalId || (Boolean(input.slug) && item.slug === input.slug);
}

function toggleSavedInList(items: FestivalListItem[], input: ToggleSavedInput): FestivalListItem[] {
  return items.map((item) =>
    matchesFestival(item, input)
      ? {
          ...item,
          saved: !item.saved,
        }
      : item
  );
}

function buildListItem(source: ToggleSavedInput['festival']): FestivalListItem | null {
  if (!source) return null;
  return {
    festivalId: source.festivalId,
    slug: source.slug,
    title: source.title,
    city: source.city,
    start_date: source.start_date,
    saved: true,
  };
}

export function useToggleSavedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ToggleSavedInput) => toggleSaved(input.festivalId),
    onMutate: async (input): Promise<ToggleSavedContext> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['festivals'] }),
        queryClient.cancelQueries({ queryKey: ['search'] }),
        queryClient.cancelQueries({ queryKey: ['savedFestivals'] }),
        queryClient.cancelQueries({ queryKey: ['festival'] }),
      ]);

      const festivalQuerySnapshots = [
        ...queryClient.getQueriesData<FestivalListItem[]>({ queryKey: ['festivals'] }),
        ...queryClient.getQueriesData<FestivalListItem[]>({ queryKey: ['search'] }),
      ]
        .filter((entry): entry is [QueryKey, FestivalListItem[]] => Array.isArray(entry[1]))
        .map(([queryKey, data]) => ({ queryKey, data }));

      const savedFestivals = queryClient.getQueryData<FestivalListItem[]>(['savedFestivals']);
      const slug = input.slug ?? input.festival?.slug;
      const festivalDetail = slug
        ? queryClient.getQueryData<FestivalDetail>(['festival', slug])
        : undefined;

      const flatFestivalLists = festivalQuerySnapshots.flatMap((s) => s.data);
      const inFestivalList = flatFestivalLists.find((item) => matchesFestival(item, input));
      const inDetail =
        festivalDetail && (matchesFestival(festivalDetail, input) || festivalDetail.slug === slug)
          ? festivalDetail
          : undefined;
      const inSavedList = savedFestivals?.find((item) => matchesFestival(item, input));

      const currentSavedState = inFestivalList?.saved ?? inDetail?.saved ?? Boolean(inSavedList);
      const nextSavedState = !currentSavedState;

      for (const { queryKey, data } of festivalQuerySnapshots) {
        queryClient.setQueryData<FestivalListItem[]>(queryKey, toggleSavedInList(data, input));
      }

      if (slug && festivalDetail && (matchesFestival(festivalDetail, input) || festivalDetail.slug === slug)) {
        queryClient.setQueryData<FestivalDetail>(['festival', slug], {
          ...festivalDetail,
          saved: nextSavedState,
        });
      }

      if (savedFestivals) {
        let nextSaved = savedFestivals.filter((item) => !matchesFestival(item, input));
        if (nextSavedState) {
          const optimisticItem =
            buildListItem(input.festival) ?? inFestivalList ?? (inDetail ? buildListItem(inDetail) : null);
          if (optimisticItem && !nextSaved.some((item) => matchesFestival(item, optimisticItem))) {
            nextSaved = [optimisticItem, ...nextSaved];
          }
        }
        queryClient.setQueryData<FestivalListItem[]>(['savedFestivals'], nextSaved);
      }

      return { festivalQuerySnapshots, savedFestivals, festivalDetail, slug };
    },
    onError: (_error, _input, context) => {
      if (!context) return;
      if (context.festivalQuerySnapshots) {
        for (const { queryKey, data } of context.festivalQuerySnapshots) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context.savedFestivals) {
        queryClient.setQueryData(['savedFestivals'], context.savedFestivals);
      }
      if (context.slug && context.festivalDetail) {
        queryClient.setQueryData(['festival', context.slug], context.festivalDetail);
      }
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['savedFestivals'] });
      if (input.slug ?? input.festival?.slug) {
        queryClient.invalidateQueries({ queryKey: ['festival', input.slug ?? input.festival?.slug] });
      }
    },
  });
}
