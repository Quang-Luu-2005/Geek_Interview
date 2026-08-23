import {
  calculateVoucherDiscount,
  calculateVoucherDiscountCents,
} from '../../src/modules/voucher/application/voucher-discount';

describe('voucher discount policy', () => {
  it('rounds percentage discounts half up at cent precision', () => {
    expect(
      calculateVoucherDiscountCents(999n, {
        discountType: 'PERCENT',
        discountValue: '10.00',
      }),
    ).toBe(100n);
  });

  it('caps fixed discounts at the subtotal and returns a decimal snapshot', () => {
    expect(
      calculateVoucherDiscount('25.00', {
        discountType: 'FIXED',
        discountValue: '50.00',
      }),
    ).toBe('25.00');
  });

  it('supports exact decimal percentage values', () => {
    expect(
      calculateVoucherDiscount('99.99', {
        discountType: 'PERCENT',
        discountValue: '12.50',
      }),
    ).toBe('12.50');
  });
});
