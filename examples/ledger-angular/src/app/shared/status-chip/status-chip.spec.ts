import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusChipComponent } from './status-chip';

describe('StatusChipComponent', () => {
  let component: StatusChipComponent;
  let fixture: ComponentFixture<StatusChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusChipComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusChipComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders a capitalized label for the given status', () => {
    fixture.componentRef.setInput('status', 'overdue');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.trim()).toBe('Overdue');
    expect(el.querySelector('.chip--overdue')).toBeTruthy();
  });

  it('reflects paid status with the paid modifier class', () => {
    fixture.componentRef.setInput('status', 'paid');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.chip--paid')).toBeTruthy();
  });
});
