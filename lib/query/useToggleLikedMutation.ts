import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { FestivalDetail } from '@/lib/api/festivals';
import { likeFestival, unlikeFestival, type ToggleLikedResult } from '@/lib/api/likes';

type ToggleLikedInput = {
  festivalId: string;
  slug: string;
};

type Snapshot = {
  prevDetail: FestivalDetail | undefined;
};

function applyLikeToDetail(
  detail: FestivalDetail | undefined,
  liked: boolean,
  likesCount: number,
): FestivalDetail | undefined {
  if (!detail) return detail;
  if (detail.liked === liked && detail.likes_count === likesCount) return detail;
  return { ...detail, liked, likes_count: likesCount };
}

/**
 * onMutate must capture the pre-toggle `liked` value because it runs *before*
 * `mutationFn` and writes the optimistic flipped value into the cache. If
 * `mutationFn` re-read the cache it would always pick the wrong endpoint.
 * This stash is keyed on `festivalId` and consumed exactly once per call.
 */
const pendingPreLikedByFestivalId = new Map<string, boolean>();

export function useToggleLikedMutation() {
  const queryClient = useQueryClient();

  return useMutation<ToggleLikedResult, Error, ToggleLikedInput, Snapshot>({
    mutationFn: async ({ festivalId }) => {
      const wasLiked = pendingPreLikedByFestivalId.get(festivalId) ?? false;
      pendingPreLikedByFestivalId.delete(festivalId);
      return wasLiked ? unlikeFestival(festivalId) : likeFestival(festivalId);
    },
    onMutate: async ({ slug, festivalId }) => {
      await queryClient.cancelQueries({ queryKey: ['festival', slug] });
      const prevDetail = queryClient.getQueryData<FestivalDetail>(['festival', slug]);
      const prevLiked = Boolean(prevDetail?.liked);
      pendingPreLikedByFestivalId.set(festivalId, prevLiked);
      if (prevDetail) {
        const nextLiked = !prevLiked;
        const baseCount = Number.isFinite(prevDetail.likes_count) ? prevDetail.likes_count : 0;
        const nextCount = Math.max(0, baseCount + (nextLiked ? 1 : -1));
        queryClient.setQueryData<FestivalDetail | undefined>(
          ['festival', slug],
          applyLikeToDetail(prevDetail, nextLiked, nextCount),
        );
      }
      return { prevDetail };
    },
    onError: (error, { slug, festivalId }, snapshot) => {
      if (__DEV__) {
        console.error('[likeToggle] error:', error instanceof Error ? error.message : String(error));
      }
      pendingPreLikedByFestivalId.delete(festivalId);
      if (snapshot?.prevDetail) {
        queryClient.setQueryData(['festival', slug], snapshot.prevDetail);
      }
    },
    onSuccess: (result, { slug }) => {
      const current = queryClient.getQueryData<FestivalDetail>(['festival', slug]);
      if (current) {
        queryClient.setQueryData<FestivalDetail | undefined>(
          ['festival', slug],
          applyLikeToDetail(current, result.liked, result.likes_count),
        );
      }
    },
  });
}
