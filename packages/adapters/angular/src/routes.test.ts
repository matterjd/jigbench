import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { surveyComponents } from './components.js';
import { surveyRoutes } from './routes.js';

const LEDGER_ANGULAR_ROOT = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);

describe('surveyRoutes (examples/ledger-angular)', () => {
  it('resolves all five lazy loadComponent routes to their component + file (redirect-only routes are skipped)', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const routes = await surveyRoutes(LEDGER_ANGULAR_ROOT, components);

    const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));
    expect(Object.keys(byPath).sort()).toEqual(
      ['customers', 'invoices', 'invoices/:id', 'invoices/:id/edit', 'invoices/new'].sort(),
    );

    expect(byPath['invoices'].component).toBe('InvoiceListComponent');
    expect(byPath['invoices'].file).toBe(
      'src/app/invoices/invoice-list/invoice-list.ts',
    );
    expect(byPath['invoices/new'].component).toBe('InvoiceFormComponent');
    expect(byPath['invoices/:id/edit'].component).toBe('InvoiceFormComponent');
    expect(byPath['invoices/:id'].component).toBe('InvoiceDetailComponent');
    expect(byPath['customers'].component).toBe('CustomerListComponent');
  });
});

describe('surveyRoutes (children flattening — no such nesting exists in the fixture)', () => {
  it('flattens nested children into full paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-ng-routes-'));
    await mkdir(join(dir, 'admin'), { recursive: true });
    await writeFile(
      join(dir, 'admin', 'users.ts'),
      [
        "import { Component } from '@angular/core';",
        "@Component({ selector: 'app-users', template: '' })",
        'export class UsersComponent {}',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'app.routes.ts'),
      [
        "import { Routes } from '@angular/router';",
        "import { UsersComponent } from './admin/users';",
        '',
        'export const routes: Routes = [',
        '  {',
        "    path: 'admin',",
        '    children: [',
        "      { path: 'users', component: UsersComponent },",
        '    ],',
        '  },',
        '];',
        '',
      ].join('\n'),
    );

    const components = await surveyComponents(dir);
    const routes = await surveyRoutes(dir, components);

    expect(routes).toEqual([
      { path: 'admin/users', component: 'UsersComponent', file: 'admin/users.ts' },
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('resolves a direct `component:` reference (no lazy loadComponent) via the routes file import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-ng-routes-direct-'));
    await writeFile(
      join(dir, 'home.ts'),
      [
        "import { Component } from '@angular/core';",
        "@Component({ selector: 'app-home', template: '' })",
        'export class HomeComponent {}',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'app.routes.ts'),
      [
        "import { Routes } from '@angular/router';",
        "import { HomeComponent } from './home';",
        '',
        "export const routes: Routes = [{ path: '', component: HomeComponent }];",
        '',
      ].join('\n'),
    );

    const components = await surveyComponents(dir);
    const routes = await surveyRoutes(dir, components);

    expect(routes).toEqual([{ path: '', component: 'HomeComponent', file: 'home.ts' }]);

    await rm(dir, { recursive: true, force: true });
  });
});
