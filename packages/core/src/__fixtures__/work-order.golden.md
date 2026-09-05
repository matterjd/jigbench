---
jigFormat: 1
id: "0007"
slug: highlight-invoice-due-date
state: released
draftedBy: model
marks: ["m-0001", "m-0002"]
---

## What

Highlight the invoice due date in red when it is overdue.

## Why

Customers miss overdue invoices because nothing calls it out.

## Where

InvoiceListComponent, the due-date cell.

## Acceptance

- An overdue due-date cell renders in the alert colour.
- A due date that is today or in the future renders unchanged.

## Fixture

invoice-overdue.json

## Shop brief

Add a computed signal that flags overdue rows and bind it to the due-date cell class.

### Files

- src/app/invoice-list/invoice-list.component.ts
- src/app/invoice-list/invoice-list.component.html

### Patterns

- Angular signals for derived state
- ngClass binding on a computed signal

### Tests

- invoice-list.component.spec.ts: overdue row gets the alert class
