import type { FestivalListItem } from '@/lib/api/festivals';

export type SearchDateBucketKey = 'today' | 'this_week' | 'upcoming';

export type GroupedSearchSection = {
  key: SearchDateBucketKey;
  title: string;
  data: FestivalListItem[];
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Week starts Monday (local), aligned with common BG locale expectations. */
function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeekSunday(ref: Date): Date {
  const start = startOfWeekMonday(ref);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

/** Groups listing search hits by start date (client-only, v1). */
export function groupSearchResultsByDate(items: FestivalListItem[], now = new Date()): GroupedSearchSection[] {
  const today = startOfLocalDay(now);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekSunday(now);

  const buckets: Record<SearchDateBucketKey, FestivalListItem[]> = {
    today: [],
    this_week: [],
    upcoming: [],
  };

  for (const item of items) {
    const start = new Date(item.start_date);
    if (Number.isNaN(start.getTime())) {
      buckets.upcoming.push(item);
      continue;
    }
    const day = startOfLocalDay(start);
    if (day.getTime() === today.getTime()) {
      buckets.today.push(item);
    } else if (day.getTime() >= weekStart.getTime() && day.getTime() <= weekEnd.getTime()) {
      buckets.this_week.push(item);
    } else {
      buckets.upcoming.push(item);
    }
  }

  const sections: GroupedSearchSection[] = [];
  if (buckets.today.length > 0) {
    sections.push({ key: 'today', title: 'Днес', data: buckets.today });
  }
  if (buckets.this_week.length > 0) {
    sections.push({ key: 'this_week', title: 'Тази седмица', data: buckets.this_week });
  }
  if (buckets.upcoming.length > 0) {
    sections.push({ key: 'upcoming', title: 'Предстоящи', data: buckets.upcoming });
  }
  return sections;
}
