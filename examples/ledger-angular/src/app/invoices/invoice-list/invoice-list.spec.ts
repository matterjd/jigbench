import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Invoice } from '../../core/models/invoice.model';
import { InvoicesService } from '../../core/services/invoices';
import { InvoiceListComponent } from './invoice-list';

const FAKE_INVOICES: Invoice[] = [
  {
    id: 'inv-1001',
    number: 'INV-1001',
    customerId: 'cust-001',
    customerName: 'Acme Robotics',
    issuedOn: '2026-07-01',
    dueOn: '2026-07-31',
    status: 'paid',
    lines: [],
    notes: '',
    total: 1250,
  },
];

describe('InvoiceListComponent', () => {
  let fixture: ComponentFixture<InvoiceListComponent>;

  beforeEach(async () => {
    const invoicesServiceStub: Partial<InvoicesService> = {
      list: () => of(FAKE_INVOICES),
    };

    await TestBed.configureTestingModule({
      imports: [InvoiceListComponent],
      providers: [provideRouter([]), { provide: InvoicesService, useValue: invoicesServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceListComponent);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a row per invoice with its number, customer and formatted total', () => {
    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelector('.invoice-list__row');
    expect(row?.textContent).toContain('INV-1001');
    expect(row?.textContent).toContain('Acme Robotics');
    expect(row?.textContent).toContain('$1,250.00');
  });

  it('renders a status chip per invoice', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-status-chip')).toBeTruthy();
  });
});
