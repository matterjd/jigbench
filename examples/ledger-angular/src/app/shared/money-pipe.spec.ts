import { MoneyPipe } from './money-pipe';

describe('MoneyPipe', () => {
  let pipe: MoneyPipe;

  beforeEach(() => {
    pipe = new MoneyPipe();
  });

  it('creates an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('formats a positive amount as USD currency', () => {
    expect(pipe.transform(1234.5)).toBe('$1,234.50');
  });

  it('formats zero', () => {
    expect(pipe.transform(0)).toBe('$0.00');
  });

  it('formats null/undefined as an em dash', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });
});
