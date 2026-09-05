import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'invoices' },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./invoices/invoice-list/invoice-list').then((m) => m.InvoiceListComponent),
  },
  {
    path: 'invoices/new',
    loadComponent: () =>
      import('./invoices/invoice-form/invoice-form').then((m) => m.InvoiceFormComponent),
  },
  {
    path: 'invoices/:id/edit',
    loadComponent: () =>
      import('./invoices/invoice-form/invoice-form').then((m) => m.InvoiceFormComponent),
  },
  {
    path: 'invoices/:id',
    loadComponent: () =>
      import('./invoices/invoice-detail/invoice-detail').then((m) => m.InvoiceDetailComponent),
  },
  {
    path: 'customers',
    loadComponent: () =>
      import('./customers/customer-list/customer-list').then((m) => m.CustomerListComponent),
  },
];
