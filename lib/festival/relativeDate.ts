/** Calendar-day comparison in local timezone. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Human-readable event date: Днес / Утре / short BG date. */
export function getRelativeDateLabel(iso: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Днес';
  if (diffDays === 1) return 'Утре';
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
}

export function formatDateRangeRelative(start: string, end?: string | null): string {
  const a = getRelativeDateLabel(start);
  if (!end?.trim() || end === start) return a;
  return `${a} – ${getRelativeDateLabel(end)}`;
}

/** “Starts in …” copy for BG UI. */
export function getStartsInLabelBg(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const startOfToday = startOfLocalDay(now);
  const startOfTarget = startOfLocalDay(date);
  const diffDays = Math.ceil((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays <= 0) return 'Вече започна';
  if (diffDays === 1) return 'Започва утре';
  if (diffDays === 2) return 'След 2 дни';
  return `След ${diffDays} дни`;
}
