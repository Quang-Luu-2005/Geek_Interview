import {
  centsToDecimal,
  decimalToCents,
  percentageDiscountCents,
} from '../../src/shared/money/money';

describe('money arithmetic', () => {
  it('keeps two-decimal monetary values exact without floating point arithmetic', () => {
    expect(decimalToCents('150.00')).toBe(15000n);
    expect(decimalToCents('0.5')).toBe(50n);
    expect(centsToDecimal(10005n)).toBe('100.05');
  });

  it('rounds percentage discounts half up and supports decimal percentages', () => {
    expect(percentageDiscountCents(999n, '10.00')).toBe(100n);
    expect(percentageDiscountCents(10000n, '12.50')).toBe(1250n);
  });
});
