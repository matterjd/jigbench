import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Invoice } from '../../core/models/invoice.model';
import { InvoicesService } from '../../core/services/invoices';
import { InvoiceListComponent } from './invoice-list';

/** "Today" for every test below — 15 days after INV-1002's due date. */
const TODAY = new Date('2026-08-15T09:00:00');

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
  {
    id: 'inv-1002',
    number: 'INV-1002',
    customerId: 'cust-002',
    customerName: 'Blue Harbor Cafe',
    issuedOn: '2026-07-01',
    dueOn: '2026-07-31',
    status: 'overdue',
    lines: [],
    notes: '',
    total: 480,
  },
  {
    id: 'inv-1003',
    number: 'INV-1003',
    customerId: 'cust-003',
    customerName: 'Cedar Ridge Landscaping',
    issuedOn: '2026-08-01',
    dueOn: '2026-08-31',
    status: 'sent',
    lines: [],
    notes: '',
    total: 900,
  },
];

describe('InvoiceListComponent', () => {
  let fixture: ComponentFixture<InvoiceListComponent>;

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(TODAY);

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

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function rows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.invoice-list__row'));
  }

  function overdueCell(row: HTMLElement): HTMLElement | null {
    return row.querySelector('.invoice-list__overdue');
  }

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a row per invoice with its number, customer and formatted total', () => {
    const row = rows()[0];
    expect(row?.textContent).toContain('INV-1001');
    expect(row?.textContent).toContain('Acme Robotics');
    expect(row?.textContent).toContain('$1,250.00');
  });

  it('renders a status chip per invoice', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-status-chip')).toBeTruthy();
  });

  it('shows the due date and, right after it, an Overdue column', () => {
    const headers = Array.from(fixture.nativeElement.querySelectorAll('thead th')).map((th) =>
      (th as HTMLElement).textContent?.trim(),
    );
    const due = headers.indexOf('Due');
    expect(due).toBeGreaterThan(-1);
    expect(headers[due + 1]).toBe('Overdue');
    expect(rows()[1].textContent).toContain('2026-07-31');
  });

  it('shows how many days an unpaid invoice is past its due date', () => {
    const cell = overdueCell(rows()[1]);
    expect(cell?.textContent?.replace(/\s+/g, ' ').trim()).toBe('15 days');
    expect(cell?.querySelector('.invoice-list__overdue-badge')).toBeTruthy();
  });

  it('shows no count for a paid invoice, even one past its due date', () => {
    const cell = overdueCell(rows()[0]);
    expect(cell?.querySelector('.invoice-list__overdue-badge')).toBeNull();
    expect(cell?.textContent).not.toContain('days');
  });

  it('shows no count for an invoice that is not yet due', () => {
    const cell = overdueCell(rows()[2]);
    expect(cell?.querySelector('.invoice-list__overdue-badge')).toBeNull();
    expect(cell?.textContent).not.toContain('days');
  });

  it('spans the empty-state cell across every column', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [InvoiceListComponent],
      providers: [provideRouter([]), { provide: InvoicesService, useValue: { list: () => of([]) } }],
    }).compileComponents();
    const empty = TestBed.createComponent(InvoiceListComponent);
    empty.detectChanges();
    const headerCount = empty.nativeElement.querySelectorAll('thead th').length;
    const cell: HTMLTableCellElement | null = empty.nativeElement.querySelector('.invoice-list__empty');
    expect(cell?.colSpan).toBe(headerCount);
  });
});
