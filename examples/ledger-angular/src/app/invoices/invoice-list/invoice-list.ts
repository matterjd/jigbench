import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { InvoicesService } from '../../core/services/invoices';
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
}
