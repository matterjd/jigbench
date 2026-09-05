# examples/

Two tiny apps for a fictitious small business, **Ledger**, that Jig's adapters, proxy, fixtures
and trial fit are tested against — and that ship as the open-source demo. Not a workspace
package (see the root `MAP.md`); nothing in `packages/` imports these.

- [`ledger-angular/`](ledger-angular) — Angular 20, standalone components + signals. Invoices and
  customers, a reactive invoice form, its own light-theme design system
  (`--ledger-*` CSS custom properties + a few mirrored `$ledger-*` SCSS variables) deliberately
  distinct from Jig's own tokens.
- [`ledger-api/`](ledger-api) — .NET 10 minimal API. In-memory seeded store (4 customers, 8
  invoices), OpenAPI document, one MVC-style controller alongside the minimal-API route maps.
- [`ledger-api.tests/`](ledger-api.tests) — xUnit + `WebApplicationFactory` tests for the API.

**All data in both apps is fake** — placeholder customers and invoices for testing only. Neither
app is a real business, and Jig never edits either one's source; it only ever reads them.

## Run both

```bash
# terminal 1
cd examples/ledger-api && dotnet run          # http://localhost:5210

# terminal 2
cd examples/ledger-angular && npm install && npm start   # http://localhost:4200
```

The Angular dev server proxies `/api/*` to the API (`proxy.conf.json`), so
`http://localhost:4200/api/invoices` and `http://localhost:5210/api/invoices` should return the
same JSON.

## Build & test

```bash
cd examples/ledger-angular && npm install && npm run build && npm test
cd examples/ledger-api && dotnet build
cd examples/ledger-api.tests && dotnet test
```

## Smoke test

`smoke.sh` starts both apps, waits for both ports, curls `/api/invoices` through the Angular
proxy and the API's OpenAPI document directly, prints PASS/FAIL for each check, and stops both
processes by PID (found via their listening port — never by process name):

```bash
./smoke.sh
```

## The recorded OpenAPI snapshot

`ledger-api/openapi.v1.json` is a **verbatim recording** of `GET http://localhost:5210/openapi/v1.json`
— checked in so the `packages/adapters/dotnet` survey adapter's tests can assert against it
without starting the API. Refresh it (see `ledger-api/README.md` "Refreshing `openapi.v1.json`")
whenever a model or endpoint shape changes; a stale snapshot means the adapter's tests are
testing yesterday's API.
