import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'festivo.recentSearches.v1';
const MAX_ITEMS = 8;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim());
  } catch {
    return [];
  }
}

/** Prepends `term`, de-duplicates case-insensitively, keeps newest first, max 8. */
export async function addRecentSearch(term: string): Promise<void> {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    const prev = await getRecentSearches();
    const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
}
