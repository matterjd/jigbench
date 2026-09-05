import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { CustomersService } from '../../core/services/customers';

@Component({
  selector: 'app-customer-list',
  imports: [],
  templateUrl: './customer-list.html',
  styleUrl: './customer-list.scss',
})
export class CustomerListComponent {
  private readonly customersService = inject(CustomersService);

  protected readonly customers = toSignal(
    this.customersService.list().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
}
