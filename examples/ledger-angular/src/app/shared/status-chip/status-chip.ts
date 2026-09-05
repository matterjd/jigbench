import { Component, computed, input } from '@angular/core';

import { InvoiceStatus } from '../../core/models/invoice.model';

@Component({
  selector: 'app-status-chip',
  imports: [],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
})
export class StatusChipComponent {
  readonly status = input.required<InvoiceStatus>();

  protected readonly label = computed(() => {
    const s = this.status();
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}
