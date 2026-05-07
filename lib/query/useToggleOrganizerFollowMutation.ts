import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrganizerDetail } from '@/lib/api/organizers';
import { followOrganizer, unfollowOrganizer } from '@/lib/api/organizerFollow';

type ToggleOrganizerFollowInput = {
  organizerId: string;
  /** Current follow state from cache before toggle. */
  following: boolean;
};

type ToggleContext = {
  previous: OrganizerDetail | undefined;
};

export function useToggleOrganizerFollowMutation(slug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ToggleOrganizerFollowInput, ToggleContext>({
    mutationFn: async (input) => {
      if (input.following) {
        await unfollowOrganizer(input.organizerId);
      } else {
        await followOrganizer(input.organizerId);
      }
    },
    onMutate: async (input) => {
      if (!slug) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: ['organizer', slug] });
      const previous = queryClient.getQueryData<OrganizerDetail>(['organizer', slug]);
      if (!previous) {
        return { previous };
      }

      const nextFollowing = !input.following;
      const prevCount = previous.followers_count;
      const nextCount =
        typeof prevCount === 'number'
          ? Math.max(0, prevCount + (nextFollowing ? 1 : -1))
          : prevCount;

      queryClient.setQueryData<OrganizerDetail>(['organizer', slug], {
        ...previous,
        is_following: nextFollowing,
        followers_count: nextCount,
      });

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous && slug) {
        queryClient.setQueryData(['organizer', slug], context.previous);
      }
    },
    onSettled: () => {
      if (slug) {
        queryClient.invalidateQueries({ queryKey: ['organizer', slug] });
      }
    },
  });
}
