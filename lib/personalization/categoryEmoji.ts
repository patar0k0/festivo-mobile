/**
 * Maps icon slug strings (returned by the API's category.icon field) to emoji.
 * Used in both the onboarding screen and the map category chips.
 */
export const ICON_SLUG_TO_EMOJI: Record<string, string> = {
  music: '🎵',
  traditional: '🎻',
  food: '🍲',
  crafts: '🧶',
  palette: '🎨',
  culture: '🎭',
  family: '👨‍👩‍👧',
  dance: '💃',
  film: '🎬',
  theatre: '🎭',
  market: '🛍️',
  sports: '🏅',
  festival: '🎉',
  folk: '🎻',
  wine: '🍷',
  art: '🎨',
  nature: '🌿',
  history: '🏛️',
  religion: '⛪',
  sabor: '🎪',
};

/**
 * Returns an emoji for a category given its icon slug and/or Bulgarian label.
 * Falls back to keyword matching on the label when the icon slug is unknown.
 */
export function emojiForCategory(label: string, iconSlug?: string | null): string {
  if (iconSlug && ICON_SLUG_TO_EMOJI[iconSlug]) return ICON_SLUG_TO_EMOJI[iconSlug]!;
  const l = label.toLowerCase();
  if (l.includes('музик') || l.includes('концерт')) return '🎵';
  if (l.includes('фолклор') || l.includes('народ') || l.includes('традиц')) return '🎻';
  if (l.includes('храна') || l.includes('кулинар') || l.includes('гурме')) return '🍲';
  if (l.includes('занаят') || l.includes('базар') || l.includes('пазар')) return '🧶';
  if (l.includes('семей') || l.includes('детск')) return '👨‍👩‍👧';
  if (l.includes('танц')) return '💃';
  if (l.includes('театър') || l.includes('изкуств') || l.includes('арт') || l.includes('культур')) return '🎭';
  if (l.includes('филм') || l.includes('кино')) return '🎬';
  if (l.includes('спорт')) return '🏅';
  if (l.includes('вин')) return '🍷';
  if (l.includes('събор')) return '🎪';
  if (l.includes('туристи') || l.includes('природ')) return '🗺️';
  return '🎉';
}
