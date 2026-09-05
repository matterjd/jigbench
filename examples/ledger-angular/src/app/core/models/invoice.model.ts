/**
 * Ledger domain models. This is FAKE data for a fictitious small business
 * ("Ledger") used only as a Jig fixture app — see the repo README.
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  issuedOn: string; // ISO date
  dueOn: string; // ISO date
  status: InvoiceStatus;
  lines: InvoiceLine[];
  notes: string;
  total: number;
}

export interface InvoiceFormValue {
  customerId: string;
  issuedOn: string;
  dueOn: string;
  notes: string;
  lines: InvoiceLine[];
}
