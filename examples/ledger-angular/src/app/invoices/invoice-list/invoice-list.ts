import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Invoice } from '../../core/models/invoice.model';
import { InvoicesService } from '../../core/services/invoices';
import { daysOverdue } from '../../shared/days-overdue';
import { MoneyPipe } from '../../shared/money-pipe';
import { StatusChipComponent } from '../../shared/status-chip/status-chip';

@Component({
  selector: 'app-invoice-list',
  imports: [RouterLink, MoneyPipe, StatusChipComponent],
  templateUrl: './invoice-list.html',
  styleUrl: './invoice-list.scss',
})
export class InvoiceListComponent {
  private readonly invoicesService = inject(InvoicesService);

  protected readonly invoices = toSignal(
    this.invoicesService.list().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  /**
   * Days this invoice is past its due date, or `null` when there is nothing
   * to flag: it is not yet due, or it is settled (paid / void) and so cannot
   * be late no matter how old its due date is.
   */
  protected daysOverdue(invoice: Invoice): number | null {
    if (invoice.status === 'paid' || invoice.status === 'void') {
      return null;
    }
    const days = daysOverdue(invoice.dueOn);
    return days !== null && days > 0 ? days : null;
  }
}
