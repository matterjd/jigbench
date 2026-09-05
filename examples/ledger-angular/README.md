# Ledger (Angular)

A tiny Angular 20 app for a fictitious small business, **Ledger**, that tracks invoices and
customers. It exists as a **Jig fixture**: a stand-in for a third party's real application, with
its own light-theme design system (paper / ink / a muted teal accent — see
`src/styles.scss`) that is deliberately *not* Jig's own tokens, so Jig's gauges panel has a
foreign token set to survey. It pairs with [`../ledger-api`](../ledger-api) (.NET 10).

**All data is fake.** The seeded invoices and customers (Acme Robotics, Blue Harbor Cafe, Cedar
Ridge Landscaping, Dune & Co. Design Studio, and eight invoices between them) are placeholder
names for testing only — nothing here represents a real business.

## What's here

- Standalone components + signals throughout (no NgModules).
- Routes: `/invoices` (list), `/invoices/:id` (detail), `/invoices/new` and `/invoices/:id/edit`
  (a reactive form), `/customers` (list) — all behind a `ShellComponent` with a header nav.
- Shared building blocks: `StatusChipComponent` (`[status]` input) and a `MoneyPipe`.
- `InvoicesService` / `CustomersService` call `/api/...` via `HttpClient`; a dev-server proxy
  (`proxy.conf.json`) forwards `/api` to the Ledger API at `http://localhost:5210`.
- Design tokens in `src/styles.scss`: CSS custom properties (`--ledger-*`) for colour, type,
  space (4px grid), radius, shadow and motion, plus a handful mirrored as SCSS variables
  (`$ledger-*`) — both forms exist on purpose so a token survey finds both.

## Run it

```bash
npm install
npm start        # ng serve — http://localhost:4200
```

The dev server proxies `/api/*` to `http://localhost:5210`, so start
[`../ledger-api`](../ledger-api) first (`dotnet run`) if you want real data instead of proxy
errors in the console.

## Build & test

```bash
npm run build     # ng build
npm test          # ng test (Karma + Jasmine, Chrome)
```

## Layout

```
src/app/
  shell/                    header nav + <router-outlet>
  invoices/invoice-list/    /invoices
  invoices/invoice-detail/  /invoices/:id
  invoices/invoice-form/    /invoices/new, /invoices/:id/edit (reactive form, line items array)
  customers/customer-list/  /customers
  shared/                   StatusChipComponent, MoneyPipe
  core/models/              Invoice, Customer, InvoiceFormValue
  core/services/            InvoicesService, CustomersService (HttpClient -> /api/...)
```
