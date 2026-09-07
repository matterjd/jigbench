const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days between an ISO due date (`YYYY-MM-DD`) and `today`.
 * Positive when the due date has passed, 0 on the day itself, negative while
 * it is still ahead; `null` when the due date cannot be parsed.
 *
 * Both sides are collapsed to UTC midnight so the count never drifts by an
 * hour across a DST change or a time-of-day difference.
 */
export function daysOverdue(dueOn: string, today: Date = new Date()): number | null {
  const due = new Date(dueOn);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayUtc - dueUtc) / MS_PER_DAY);
}
