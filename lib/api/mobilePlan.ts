import { apiFetch } from '@/lib/api/client';

export type MobilePlanReminderType = 'none' | '24h' | 'same_day_09' | 'default';

export type MobilePlanReminderDto = {
  type: MobilePlanReminderType;
  updated_at: string;
};

export type MobilePlanStatsDto = {
  savedFestivalCount: number;
  plannedItemCount: number;
  upcomingCount: number;
};

export type SavedFestivalBasicDto = {
  festivalId: string;
  slug: string;
  title: string;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  image_url: string | null;
  category: string | null;
  is_verified: boolean;
  organizer_name: string | null;
};

export type MobilePlanStateDto = {
  savedFestivalIds: string[];
  savedFestivals: SavedFestivalBasicDto[];
  savedScheduleItemIds: string[];
  reminders: Record<string, MobilePlanReminderDto>;
  stats: MobilePlanStatsDto;
  updated_at: string;
};

type MobilePlanRequestOptions = {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown, status: number): string {
  const rec = asRecord(body);
  const raw = rec?.error ?? rec?.message;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (status === 401) return 'Трябва да влезеш в профила си.';
  if (status === 404) return 'Ресурсът не е намерен.';
  return `Заявката неуспешна (${status})`;
}

function parseReminderType(raw: unknown): MobilePlanReminderType {
  if (raw === 'none' || raw === '24h' || raw === 'same_day_09' || raw === 'default') return raw;
  return 'default';
}

function parsePlanState(body: unknown): MobilePlanStateDto {
  const rec = asRecord(body);
  const remindersRaw = asRecord(rec?.reminders) ?? {};
  const reminders: Record<string, MobilePlanReminderDto> = {};
  for (const [festivalId, value] of Object.entries(remindersRaw)) {
    const r = asRecord(value);
    reminders[festivalId] = {
      type: parseReminderType(r?.type),
      updated_at: typeof r?.updated_at === 'string' && r.updated_at ? r.updated_at : new Date(0).toISOString(),
    };
  }
  const statsRaw = asRecord(rec?.stats);
  const savedFestivals: SavedFestivalBasicDto[] = Array.isArray(rec?.savedFestivals)
    ? (rec.savedFestivals as unknown[]).flatMap((item) => {
        const f = asRecord(item);
        if (!f?.festivalId || !f?.slug) return [];
        return [{
          festivalId: String(f.festivalId),
          slug: String(f.slug),
          title: typeof f.title === 'string' ? f.title : '',
          city: typeof f.city === 'string' ? f.city : null,
          start_date: typeof f.start_date === 'string' ? f.start_date : null,
          end_date: typeof f.end_date === 'string' ? f.end_date : null,
          image_url: typeof f.image_url === 'string' ? f.image_url : null,
          category: typeof f.category === 'string' ? f.category : null,
          is_verified: Boolean(f.is_verified),
          organizer_name: typeof f.organizer_name === 'string' ? f.organizer_name : null,
        }];
      })
    : [];

  return {
    savedFestivalIds: Array.isArray(rec?.savedFestivalIds)
      ? rec.savedFestivalIds.map((x) => String(x)).filter(Boolean)
      : [],
    savedFestivals,
    savedScheduleItemIds: Array.isArray(rec?.savedScheduleItemIds)
      ? rec.savedScheduleItemIds.map((x) => String(x)).filter(Boolean)
      : [],
    reminders,
    stats: {
      savedFestivalCount: Number(statsRaw?.savedFestivalCount ?? 0) || 0,
      plannedItemCount: Number(statsRaw?.plannedItemCount ?? 0) || 0,
      upcomingCount: Number(statsRaw?.upcomingCount ?? 0) || 0,
    },
    updated_at:
      typeof rec?.updated_at === 'string' && rec.updated_at ? rec.updated_at : new Date(0).toISOString(),
  };
}

async function requestMobilePlan<T>(path: string, options?: MobilePlanRequestOptions): Promise<T> {
  const res = await apiFetch(path, undefined, {
    method: options?.method ?? 'GET',
    signal: options?.signal,
    body: options?.body == null ? undefined : JSON.stringify(options.body),
  });
  const body = await readJson(res);
  if (!res.ok) {
    if (__DEV__) {
      console.warn(`[API] ${path} error body:`, JSON.stringify(body));
    }
    throw new Error(readErrorMessage(body, res.status));
  }
  return body as T;
}

export async function getMobilePlanState(signal?: AbortSignal): Promise<MobilePlanStateDto> {
  const body = await requestMobilePlan<unknown>('/api/mobile/plan/state', { signal });
  return parsePlanState(body);
}

export async function saveFestivalToPlan(festivalId: string): Promise<{ saved: boolean; festivalId: string }> {
  return requestMobilePlan('/api/mobile/plan/festivals', {
    method: 'POST',
    body: { festivalId },
  });
}

export async function removeFestivalFromPlan(
  festivalId: string,
): Promise<{ saved: boolean; festivalId: string }> {
  return requestMobilePlan('/api/mobile/plan/festivals', {
    method: 'DELETE',
    body: { festivalId },
  });
}

export async function toggleScheduleItemInPlan(
  scheduleItemId: string,
): Promise<{ ok: boolean; inPlan: boolean; scheduleItemId: string }> {
  const body = await requestMobilePlan<unknown>('/api/mobile/plan/items', {
    method: 'POST',
    body: { scheduleItemId },
  });
  const rec = asRecord(body);
  return {
    ok: Boolean(rec?.ok),
    inPlan: Boolean(rec?.inPlan),
    scheduleItemId,
  };
}

export async function updateFestivalReminder(
  festivalId: string,
  type: MobilePlanReminderType,
): Promise<{ ok: boolean; festivalId: string; type: MobilePlanReminderType }> {
  const body = await requestMobilePlan<unknown>('/api/mobile/plan/reminders', {
    method: 'POST',
    body: { festivalId, type },
  });
  const rec = asRecord(body);
  return {
    ok: Boolean(rec?.ok),
    festivalId: String(rec?.festivalId ?? festivalId),
    type: parseReminderType(rec?.type ?? type),
  };
}
