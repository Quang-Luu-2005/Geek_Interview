import {
  centsToDecimal,
  decimalToCents,
  percentageDiscountCents,
} from '../../../shared/money/money';

export type VoucherDiscountType = 'PERCENT' | 'FIXED';

export interface VoucherDiscountInput {
  discountType: VoucherDiscountType;
  discountValue: string;
}

export function calculateVoucherDiscountCents(
  subtotalCents: bigint,
  voucher: VoucherDiscountInput,
): bigint {
  const requestedDiscount =
    voucher.discountType === 'PERCENT'
      ? percentageDiscountCents(subtotalCents, voucher.discountValue)
      : decimalToCents(voucher.discountValue);

  return requestedDiscount > subtotalCents ? subtotalCents : requestedDiscount;
}

export function calculateVoucherDiscount(subtotal: string, voucher: VoucherDiscountInput): string {
  return centsToDecimal(calculateVoucherDiscountCents(decimalToCents(subtotal), voucher));
}
