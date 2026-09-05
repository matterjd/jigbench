import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { Invoice } from '../models/invoice.model';
import { InvoicesService } from './invoices';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvoicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('lists invoices from /api/invoices', () => {
    const fake: Invoice[] = [];
    service.list().subscribe((invoices) => expect(invoices).toBe(fake));

    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.method).toBe('GET');
    req.flush(fake);
  });

  it('gets a single invoice by id', () => {
    service.get('inv-1001').subscribe();
    const req = httpMock.expectOne('/api/invoices/inv-1001');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('posts a new invoice', () => {
    const value = { customerId: 'cust-001', issuedOn: '', dueOn: '', notes: '', lines: [] };
    service.create(value).subscribe();
    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(value);
    req.flush({});
  });

  it('puts an updated invoice', () => {
    const value = { customerId: 'cust-001', issuedOn: '', dueOn: '', notes: '', lines: [] };
    service.update('inv-1001', value).subscribe();
    const req = httpMock.expectOne('/api/invoices/inv-1001');
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });
});
