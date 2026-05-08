import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetch } from "@/lib/api/client";

const STORAGE_KEY = "festivo.onboarding.v1";

export type OnboardingDraft = {
  completed: boolean;
  step: number;
  categories: string[];
  cities: string[];
  notificationInterests: string[];
  organizerIds: string[];
  locationPermissionAsked: boolean;
  skipped: boolean;
};

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  completed: false,
  step: 0,
  categories: [],
  cities: [],
  notificationInterests: [],
  organizerIds: [],
  locationPermissionAsked: false,
  skipped: false,
};

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function normalize(raw: unknown): OnboardingDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_ONBOARDING_DRAFT;
  const rec = raw as Record<string, unknown>;
  return {
    completed: Boolean(rec.completed),
    step: Number.isFinite(rec.step) ? Math.max(0, Math.floor(Number(rec.step))) : 0,
    categories: uniq(Array.isArray(rec.categories) ? rec.categories.map(String) : []),
    cities: uniq(Array.isArray(rec.cities) ? rec.cities.map(String) : []),
    notificationInterests: uniq(Array.isArray(rec.notificationInterests) ? rec.notificationInterests.map(String) : []),
    organizerIds: uniq(Array.isArray(rec.organizerIds) ? rec.organizerIds.map(String) : []),
    locationPermissionAsked: Boolean(rec.locationPermissionAsked),
    skipped: Boolean(rec.skipped),
  };
}

export async function getOnboardingDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ONBOARDING_DRAFT;
    return normalize(JSON.parse(raw));
  } catch {
    return EMPTY_ONBOARDING_DRAFT;
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(draft)));
  } catch {
    // local persistence failure should not block UX
  }
}

export async function syncOnboardingToBackend(draft: OnboardingDraft): Promise<void> {
  const notify = new Set(draft.notificationInterests);
  await apiFetch("/api/notification-settings", undefined, {
    method: "POST",
    body: JSON.stringify({
      notify_new_festivals_category: notify.has("categories"),
      notify_new_festivals_city: notify.has("cities"),
      notify_followed_organizers: notify.has("organizers"),
      notify_trending_alerts: notify.has("trending"),
      notify_nearby_discovery: notify.has("nearby"),
    }),
  });

  for (const city of draft.cities) {
    await apiFetch("/api/follow/city", undefined, {
      method: "POST",
      body: JSON.stringify({ city_slug: city }),
    });
  }
  for (const category of draft.categories) {
    await apiFetch("/api/follow/category", undefined, {
      method: "POST",
      body: JSON.stringify({ category_slug: category }),
    });
  }
  for (const organizerId of draft.organizerIds) {
    await apiFetch("/api/follow/organizer", undefined, {
      method: "POST",
      body: JSON.stringify({ organizer_id: organizerId }),
    });
  }
}
