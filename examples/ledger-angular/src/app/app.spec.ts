import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  });

  it('creates the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the shell', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-shell')).toBeTruthy();
  });
});
