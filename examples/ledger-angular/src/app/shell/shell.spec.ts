import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ShellComponent } from './shell';

describe('ShellComponent', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the brand and nav links', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.shell__brand')?.textContent).toContain('Ledger');
    const links = Array.from(el.querySelectorAll('.shell__nav a')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Invoices', 'Customers']);
  });
});
