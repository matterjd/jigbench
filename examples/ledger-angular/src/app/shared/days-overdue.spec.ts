import { daysOverdue } from './days-overdue';

describe('daysOverdue', () => {
  const today = new Date('2026-08-15T12:00:00Z');

  it('counts whole days past the due date', () => {
    expect(daysOverdue('2026-07-31', today)).toBe(15);
  });

  it('is 1 the day after the due date', () => {
    expect(daysOverdue('2026-08-14', today)).toBe(1);
  });

  it('is 0 on the due date itself, whatever the time of day', () => {
    expect(daysOverdue('2026-08-15', today)).toBe(0);
    expect(daysOverdue('2026-08-15', new Date('2026-08-15T23:59:59Z'))).toBe(0);
  });

  it('is negative when the due date is still ahead', () => {
    expect(daysOverdue('2026-08-20', today)).toBe(-5);
  });

  it('is null for an unparseable due date', () => {
    expect(daysOverdue('w', today)).toBeNull();
    expect(daysOverdue('', today)).toBeNull();
  });
});
