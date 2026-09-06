import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { surveyComponents } from './components.js';

const LEDGER_ANGULAR_ROOT = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);

describe('surveyComponents (examples/ledger-angular)', () => {
  it('finds every @Component-decorated class in the fixture (note: the fixture has no *.component.ts files — Angular CLI 20 drops the suffix — so this walks **/*.ts for the decorator, not the filename)', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const names = components.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'App',
        'CustomerListComponent',
        'InvoiceDetailComponent',
        'InvoiceFormComponent',
        'InvoiceListComponent',
        'ShellComponent',
        'StatusChipComponent',
      ].sort(),
    );
  });

  it('records selector + repo-relative file (forward slashes) for each component', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const invoiceList = components.find((c) => c.name === 'InvoiceListComponent');
    expect(invoiceList).toBeDefined();
    expect(invoiceList?.selector).toBe('app-invoice-list');
    expect(invoiceList?.file).toBe('src/app/invoices/invoice-list/invoice-list.ts');
  });

  it('flags an inline-template component (App) with no templateUrl and no styleUrls', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const app = components.find((c) => c.name === 'App');
    expect(app?.inline).toBe(true);
    expect(app?.templateUrl).toBeUndefined();
    expect(app?.styleUrls).toEqual([]);
  });

  it('flags a templateUrl component (ShellComponent) as not inline, with its styleUrl', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const shell = components.find((c) => c.name === 'ShellComponent');
    expect(shell?.inline).toBe(false);
    expect(shell?.templateUrl).toBe('./shell.html');
    expect(shell?.styleUrls).toEqual(['./shell.scss']);
  });

  it('defaults standalone to true when the decorator does not set it (Angular 20)', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    expect(components.every((c) => c.standalone === true)).toBe(true);
  });

  it("reads StatusChipComponent's Angular 20 signal input (input.required) as a required property", async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const chip = components.find((c) => c.name === 'StatusChipComponent');
    expect(chip?.inputs).toEqual([{ name: 'status', required: true }]);
    expect(chip?.outputs).toEqual([]);
  });

  it('never mistakes an unrelated signal (computed()) on the same class for an input/output', async () => {
    const components = await surveyComponents(LEDGER_ANGULAR_ROOT);
    const chip = components.find((c) => c.name === 'StatusChipComponent');
    expect(chip?.inputs.map((i) => i.name)).not.toContain('label');
  });
});

describe('surveyComponents (decorator-based @Input/@Output — no such class exists in the fixture)', () => {
  it('reads @Input()/@Input({required:true})/@Output() from a synthetic component', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-ng-decorators-'));
    await writeFile(
      join(dir, 'widget.ts'),
      [
        "import { Component, Input, Output, EventEmitter } from '@angular/core';",
        '',
        '@Component({',
        "  selector: 'app-widget',",
        "  template: '<div></div>',",
        '})',
        'export class WidgetComponent {',
        '  @Input() label!: string;',
        '  @Input({ required: true }) value!: number;',
        '  @Output() changed = new EventEmitter<number>();',
        '}',
        '',
      ].join('\n'),
    );

    const components = await surveyComponents(dir);
    expect(components).toHaveLength(1);
    const widget = components[0];
    expect(widget.inputs).toEqual(
      expect.arrayContaining([
        { name: 'label', required: false },
        { name: 'value', required: true },
      ]),
    );
    expect(widget.outputs).toEqual([{ name: 'changed', required: false }]);

    await rm(dir, { recursive: true, force: true });
  });
});
