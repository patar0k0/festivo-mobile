import { apiFetch } from '@/lib/api/client';

export type OnboardingCategorySuggestion = {
  slug: string;
  label_bg: string;
  icon?: string;
};

export type OnboardingCitySuggestion = {
  slug: string;
  name_bg: string;
};

export type OnboardingOrganizerSuggestion = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  city: string | null;
  followers_count?: number | null;
  upcoming_festival_count?: number | null;
  categories: string[];
  explanation: string;
};

export type OnboardingSuggestionsResponse = {
  categories: OnboardingCategorySuggestion[];
  cities: OnboardingCitySuggestion[];
  organizers: OnboardingOrganizerSuggestion[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toOptionalTrimmed(value: unknown): string | null {
  const v = toTrimmed(value);
  return v ? v : null;
}

function toOptionalCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return null;
}

function parseCategory(raw: unknown): OnboardingCategorySuggestion | null {
  const row = asRecord(raw);
  if (!row) return null;
  const slug = toTrimmed(row.slug);
  const label = toTrimmed(row.label_bg);
  if (!slug || !label) return null;
  const icon = toTrimmed(row.icon) || undefined;
  return { slug, label_bg: label, icon };
}

function parseCity(raw: unknown): OnboardingCitySuggestion | null {
  const row = asRecord(raw);
  if (!row) return null;
  const slug = toTrimmed(row.slug);
  const name = toTrimmed(row.name_bg);
  if (!slug || !name) return null;
  return { slug, name_bg: name };
}

function parseOrganizer(raw: unknown): OnboardingOrganizerSuggestion | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = toTrimmed(row.id);
  const slug = toTrimmed(row.slug);
  const name = toTrimmed(row.name);
  const explanation = toTrimmed(row.explanation);
  if (!id || !slug || !name || !explanation) return null;
  const categoriesRaw = Array.isArray(row.categories) ? row.categories : [];
  const categories = categoriesRaw.map((item) => toTrimmed(item)).filter(Boolean);
  return {
    id,
    slug,
    name,
    logo_url: toOptionalTrimmed(row.logo_url),
    verified: Boolean(row.verified),
    city: toOptionalTrimmed(row.city),
    followers_count: toOptionalCount(row.followers_count),
    upcoming_festival_count: toOptionalCount(row.upcoming_festival_count),
    categories,
    explanation,
  };
}

function toQueryList(values: string[]): string {
  return [...new Set(values.map((v) => toTrimmed(v)).filter(Boolean))].join(',');
}

export async function getOnboardingSuggestions(params?: {
  categories?: string[];
  cities?: string[];
}): Promise<OnboardingSuggestionsResponse> {
  const query = new URLSearchParams();
  const categoryList = toQueryList(params?.categories ?? []);
  const cityList = toQueryList(params?.cities ?? []);
  if (categoryList) query.set('categories', categoryList);
  if (cityList) query.set('cities', cityList);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const res = await apiFetch(`/api/mobile/onboarding/suggestions${suffix}`);
  if (!res.ok) {
    throw new Error(`Failed to load suggestions (${res.status})`);
  }

  const payload = (await res.json()) as unknown;
  const data = asRecord(payload) ?? {};
  const categories = (Array.isArray(data.categories) ? data.categories : []).map(parseCategory).filter((x): x is OnboardingCategorySuggestion => Boolean(x));
  const cities = (Array.isArray(data.cities) ? data.cities : []).map(parseCity).filter((x): x is OnboardingCitySuggestion => Boolean(x));
  const organizers = (Array.isArray(data.organizers) ? data.organizers : [])
    .map(parseOrganizer)
    .filter((x): x is OnboardingOrganizerSuggestion => Boolean(x));

  return { categories, cities, organizers };
}
