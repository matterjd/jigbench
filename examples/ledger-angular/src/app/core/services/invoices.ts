import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Invoice, InvoiceFormValue } from '../models/invoice.model';

@Injectable({
  providedIn: 'root',
})
export class InvoicesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/invoices';

  list(): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(this.baseUrl);
  }

  get(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.baseUrl}/${id}`);
  }

  create(value: InvoiceFormValue): Observable<Invoice> {
    return this.http.post<Invoice>(this.baseUrl, value);
  }

  update(id: string, value: InvoiceFormValue): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.baseUrl}/${id}`, value);
  }
}
