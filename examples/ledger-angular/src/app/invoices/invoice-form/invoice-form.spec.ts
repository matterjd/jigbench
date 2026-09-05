import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Customer } from '../../core/models/customer.model';
import { Invoice } from '../../core/models/invoice.model';
import { CustomersService } from '../../core/services/customers';
import { InvoicesService } from '../../core/services/invoices';
import { InvoiceFormComponent } from './invoice-form';

const FAKE_CUSTOMERS: Customer[] = [
  { id: 'cust-001', name: 'Acme Robotics', email: 'ap@acme.test', city: 'Reno' },
];

const FAKE_INVOICE: Invoice = {
  id: 'inv-1001',
  number: 'INV-1001',
  customerId: 'cust-001',
  customerName: 'Acme Robotics',
  issuedOn: '2026-07-01',
  dueOn: '2026-07-31',
  status: 'sent',
  lines: [{ id: 'line-1', description: 'Consulting', quantity: 2, unitPrice: 100 }],
  notes: '',
  total: 200,
};

describe('InvoiceFormComponent', () => {
  let fixture: ComponentFixture<InvoiceFormComponent>;

  function setup(paramMap: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [InvoiceFormComponent],
      providers: [
        provideRouter([]),
        { provide: CustomersService, useValue: { list: () => of(FAKE_CUSTOMERS) } },
        {
          provide: InvoicesService,
          useValue: {
            get: () => of(FAKE_INVOICE),
            create: () => of({ id: 'new' }),
            update: () => of({ id: 'new' }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(paramMap) } },
        },
      ],
    });
    fixture = TestBed.createComponent(InvoiceFormComponent);
    fixture.detectChanges();
  }

  it('creates in "new" mode with one blank line to start', () => {
    setup();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.lines.length).toBe(1);
  });

  it('renders the customer select populated from CustomersService', () => {
    setup();
    const el: HTMLElement = fixture.nativeElement;
    const options = Array.from(el.querySelectorAll('select option')).map((o) => o.textContent?.trim());
    expect(options).toContain('Acme Robotics');
  });

  it('adds and removes line items', () => {
    setup();
    fixture.componentInstance.addLine();
    expect(fixture.componentInstance.lines.length).toBe(2);
    fixture.componentInstance.removeLine(0);
    expect(fixture.componentInstance.lines.length).toBe(1);
  });

  it('enters edit mode and patches the form from the existing invoice', () => {
    setup({ id: 'inv-1001' });
    expect(fixture.componentInstance.isEdit()).toBeTrue();
    expect(fixture.componentInstance.form.get('customerId')?.value).toBe('cust-001');
    expect(fixture.componentInstance.lines.length).toBe(1);
  });
});
