import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';

import { Invoice } from '../../core/models/invoice.model';
import { InvoicesService } from '../../core/services/invoices';
import { MoneyPipe } from '../../shared/money-pipe';
import { StatusChipComponent } from '../../shared/status-chip/status-chip';

@Component({
  selector: 'app-invoice-detail',
  imports: [RouterLink, MoneyPipe, StatusChipComponent],
  templateUrl: './invoice-detail.html',
  styleUrl: './invoice-detail.scss',
})
export class InvoiceDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly invoicesService = inject(InvoicesService);

  protected readonly invoice = toSignal<Invoice | undefined>(
    this.route.paramMap.pipe(
      switchMap((params) => this.invoicesService.get(params.get('id') ?? '')),
    ),
    { initialValue: undefined },
  );
}
