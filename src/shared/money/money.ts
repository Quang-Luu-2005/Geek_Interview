/** Money is kept as integer cents in the application layer. */
export function decimalToCents(value: string): bigint {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error(`Invalid monetary value: ${value}`);
  }

  const fraction = (match[2] ?? '').padEnd(2, '0');
  return BigInt(match[1]) * 100n + BigInt(fraction);
}

export function centsToDecimal(cents: bigint): string {
  if (cents < 0n) {
    throw new Error('Money cannot be negative');
  }

  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Round half up when applying a percentage with two decimal places. */
export function percentageDiscountCents(subtotalCents: bigint, percent: string): bigint {
  const percentCents = decimalToCents(percent);
  const numerator = subtotalCents * percentCents;
  return (numerator + 5000n) / 10000n;
}
