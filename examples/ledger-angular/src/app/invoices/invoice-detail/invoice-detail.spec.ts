import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { Invoice } from '../../core/models/invoice.model';
import { InvoicesService } from '../../core/services/invoices';
import { InvoiceDetailComponent } from './invoice-detail';

const FAKE_INVOICE: Invoice = {
  id: 'inv-1001',
  number: 'INV-1001',
  customerId: 'cust-001',
  customerName: 'Acme Robotics',
  issuedOn: '2026-07-01',
  dueOn: '2026-07-31',
  status: 'paid',
  lines: [{ id: 'line-1', description: 'Consulting', quantity: 5, unitPrice: 250 }],
  notes: 'Thanks for your business.',
  total: 1250,
};

describe('InvoiceDetailComponent', () => {
  let fixture: ComponentFixture<InvoiceDetailComponent>;

  beforeEach(async () => {
    const invoicesServiceStub: Partial<InvoicesService> = {
      get: () => of(FAKE_INVOICE),
    };

    await TestBed.configureTestingModule({
      imports: [InvoiceDetailComponent],
      providers: [
        { provide: InvoicesService, useValue: invoicesServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'inv-1001' })) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceDetailComponent);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the invoice number, customer, total and line items', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('INV-1001');
    expect(el.textContent).toContain('Acme Robotics');
    expect(el.textContent).toContain('$1,250.00');
    expect(el.textContent).toContain('Consulting');
  });
});
