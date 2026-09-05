import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { Customer } from '../models/customer.model';
import { CustomersService } from './customers';

describe('CustomersService', () => {
  let service: CustomersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CustomersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('lists customers from /api/customers', () => {
    const fake: Customer[] = [];
    service.list().subscribe((customers) => expect(customers).toBe(fake));

    const req = httpMock.expectOne('/api/customers');
    expect(req.request.method).toBe('GET');
    req.flush(fake);
  });

  it('gets a single customer by id', () => {
    service.get('cust-001').subscribe();
    const req = httpMock.expectOne('/api/customers/cust-001');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
