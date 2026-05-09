import type { FestivalDetail, FestivalScheduleDay, FestivalScheduleItem } from '@/lib/api/festivals';

export type ScheduleTimelineDay = FestivalScheduleDay & {
  label: string;
  items: FestivalScheduleItem[];
};

function timeValue(raw?: string | null): number {
  if (!raw?.trim()) return 24 * 60 + 999;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 24 * 60 + 999;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatScheduleTime(start?: string | null, end?: string | null): string {
  const formatOne = (raw?: string | null) => {
    const text = raw?.trim();
    if (!text) return '';
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text;
  };
  const a = formatOne(start);
  const b = formatOne(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || 'Час предстои';
}

export function formatScheduleDayLabel(dateIso: string, title?: string | null): string {
  const date = new Date(dateIso);
  const dateLabel = Number.isNaN(date.getTime())
    ? dateIso
    : date.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
  return title?.trim() ? `${dateLabel} · ${title.trim()}` : dateLabel;
}

export function sortScheduleItems(items: FestivalScheduleItem[]): FestivalScheduleItem[] {
  return [...items].sort((a, b) => {
    const timeDiff = timeValue(a.start_time) - timeValue(b.start_time);
    if (timeDiff !== 0) return timeDiff;
    return Number(a.sort_order ?? 999) - Number(b.sort_order ?? 999);
  });
}

export function groupFestivalSchedule(detail: FestivalDetail): ScheduleTimelineDay[] {
  const items = detail.schedule_items ?? [];
  const days = detail.schedule_days ?? [];
  if (!items.length) return [];

  if (!days.length) {
    return [
      {
        id: 'all',
        date: detail.start_date,
        label: 'Програма',
        items: sortScheduleItems(items),
      },
    ];
  }

  return days
    .map((day) => ({
      ...day,
      label: formatScheduleDayLabel(day.date, day.title),
      items: sortScheduleItems(items.filter((item) => String(item.day_id ?? '') === String(day.id))),
    }))
    .filter((day) => day.items.length > 0);
}

export function pickInitialScheduleDayIndex(days: ScheduleTimelineDay[]): number {
  if (!days.length) return 0;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const exact = days.findIndex((day) => {
    const d = new Date(day.date);
    return !Number.isNaN(d.getTime()) && new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() === todayStart;
  });
  if (exact >= 0) return exact;
  const upcoming = days.findIndex((day) => {
    const d = new Date(day.date);
    return !Number.isNaN(d.getTime()) && new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() > todayStart;
  });
  return upcoming >= 0 ? upcoming : 0;
}
