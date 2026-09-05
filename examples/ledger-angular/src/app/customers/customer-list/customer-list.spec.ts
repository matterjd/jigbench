import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Customer } from '../../core/models/customer.model';
import { CustomersService } from '../../core/services/customers';
import { CustomerListComponent } from './customer-list';

const FAKE_CUSTOMERS: Customer[] = [
  { id: 'cust-001', name: 'Acme Robotics', email: 'ap@acme.test', city: 'Reno' },
  { id: 'cust-002', name: 'Blue Harbor Cafe', email: 'billing@blueharbor.test', city: 'Duluth' },
];

describe('CustomerListComponent', () => {
  let fixture: ComponentFixture<CustomerListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerListComponent],
      providers: [{ provide: CustomersService, useValue: { list: () => of(FAKE_CUSTOMERS) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerListComponent);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a row per customer', () => {
    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Acme Robotics');
    expect(rows[1].textContent).toContain('Blue Harbor Cafe');
  });
});
