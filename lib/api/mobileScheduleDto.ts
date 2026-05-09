/**
 * Canonical mobile festival schedule DTO — must match festivo-web
 * `lib/api/mobile/mobileScheduleDto.ts` (`MobileFestivalScheduleDto` and nested types).
 */

export type MobileScheduleItemDto = {
  id: string;
  day_id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  venue: string | null;
  category: string | null;
  tags: string[];
  organizer_name: string | null;
  image_url: string | null;
  is_cancelled: boolean;
  sort_index: number;
};

export type MobileScheduleDayDto = {
  id: string;
  date: string;
  title: string | null;
  items: MobileScheduleItemDto[];
};

export type MobileFestivalScheduleDto = {
  timezone: string | null;
  days: MobileScheduleDayDto[];
};
