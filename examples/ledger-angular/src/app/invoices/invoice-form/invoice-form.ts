import { Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { Invoice, InvoiceFormValue } from '../../core/models/invoice.model';
import { CustomersService } from '../../core/services/customers';
import { InvoicesService } from '../../core/services/invoices';

interface LineGroupValue {
  description: string;
  quantity: number;
  unitPrice: number;
}

@Component({
  selector: 'app-invoice-form',
  imports: [ReactiveFormsModule],
  templateUrl: './invoice-form.html',
  styleUrl: './invoice-form.scss',
})
export class InvoiceFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly invoicesService = inject(InvoicesService);
  private readonly customersService = inject(CustomersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly customers = toSignal(this.customersService.list(), { initialValue: [] });

  readonly invoiceId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = signal(this.invoiceId !== null);

  readonly form: FormGroup = this.fb.group({
    customerId: ['', Validators.required],
    issuedOn: ['', Validators.required],
    dueOn: ['', Validators.required],
    notes: [''],
    lines: this.fb.array([]),
  });

  ngOnInit(): void {
    if (this.invoiceId) {
      this.invoicesService.get(this.invoiceId).subscribe((invoice) => this.patchForm(invoice));
    } else {
      this.addLine();
    }
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  buildLineGroup(
    initial: LineGroupValue = { description: '', quantity: 1, unitPrice: 0 },
  ): FormGroup {
    return this.fb.group({
      description: [initial.description, Validators.required],
      quantity: [initial.quantity, [Validators.required, Validators.min(1)]],
      unitPrice: [initial.unitPrice, [Validators.required, Validators.min(0)]],
    });
  }

  addLine(): void {
    this.lines.push(this.buildLineGroup());
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  private patchForm(invoice: Invoice): void {
    this.form.patchValue({
      customerId: invoice.customerId,
      issuedOn: invoice.issuedOn,
      dueOn: invoice.dueOn,
      notes: invoice.notes,
    });
    this.lines.clear();
    for (const line of invoice.lines) {
      this.lines.push(this.buildLineGroup(line));
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue() as {
      customerId: string;
      issuedOn: string;
      dueOn: string;
      notes: string;
      lines: LineGroupValue[];
    };
    const value: InvoiceFormValue = {
      customerId: raw.customerId,
      issuedOn: raw.issuedOn,
      dueOn: raw.dueOn,
      notes: raw.notes,
      lines: raw.lines.map((line, index) => ({
        id: `line-${index + 1}`,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    };

    const save$ = this.isEdit() && this.invoiceId
      ? this.invoicesService.update(this.invoiceId, value)
      : this.invoicesService.create(value);

    save$.subscribe((saved) => this.router.navigate(['/invoices', saved.id]));
  }
}
