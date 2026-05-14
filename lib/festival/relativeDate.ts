/** Calendar-day comparison in local timezone. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whether the festival has finished as of the local calendar day.
 * Falls back to start_date when end_date is empty. Missing/unparseable
 * dates are treated as not-past (better to show a TBA festival than
 * silently hide it).
 */
export function isFestivalPast(
  start_date: string | null | undefined,
  end_date?: string | null,
): boolean {
  const lastIso = (end_date && end_date.trim()) || (start_date && start_date.trim()) || '';
  if (!lastIso) return false;
  const last = new Date(lastIso);
  if (Number.isNaN(last.getTime())) return false;
  return startOfLocalDay(last).getTime() < startOfLocalDay(new Date()).getTime();
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
