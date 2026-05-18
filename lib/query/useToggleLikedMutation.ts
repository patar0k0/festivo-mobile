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

export function useToggleLikedMutation() {
  const queryClient = useQueryClient();

  return useMutation<ToggleLikedResult, Error, ToggleLikedInput, Snapshot>({
    mutationFn: async ({ festivalId, slug }) => {
      const current = queryClient.getQueryData<FestivalDetail>(['festival', slug]);
      const liked = Boolean(current?.liked);
      return liked ? unlikeFestival(festivalId) : likeFestival(festivalId);
    },
    onMutate: async ({ slug }) => {
      await queryClient.cancelQueries({ queryKey: ['festival', slug] });
      const prevDetail = queryClient.getQueryData<FestivalDetail>(['festival', slug]);
      if (prevDetail) {
        const nextLiked = !prevDetail.liked;
        const nextCount = Math.max(0, prevDetail.likes_count + (nextLiked ? 1 : -1));
        queryClient.setQueryData<FestivalDetail | undefined>(
          ['festival', slug],
          applyLikeToDetail(prevDetail, nextLiked, nextCount),
        );
      }
      return { prevDetail };
    },
    onError: (error, { slug }, snapshot) => {
      if (__DEV__) {
        console.error('[likeToggle] error:', error instanceof Error ? error.message : String(error));
      }
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
