import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a plain number as US currency, e.g. `1234.5` -> `"$1,234.50"`.
 * Used wherever the Ledger UI shows a money amount (invoice totals, line
 * item amounts) so formatting stays in one place.
 */
@Pipe({
  name: 'money',
})
export class MoneyPipe implements PipeTransform {
  private readonly formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return this.formatter.format(value);
  }
}
