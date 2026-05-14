import { test, expect } from 'vitest';
import { getBusiness, getPricing, formatAddress } from './business';

test('getBusiness returns typed business data', () => {
  const b = getBusiness();
  expect(b.name).toBe('The Found Sock Laundromat');
  expect(b.address.postalCode).toBe('02135');
  expect(b.geo.latitude).toBeCloseTo(42.35, 1);
});

test('getPricing returns typed pricing data', () => {
  const p = getPricing();
  expect(p.washers).toHaveLength(4);
  expect(p.washers[0].price).toBe(6.00);
  expect(p.loyalty.cashbackPercent).toBe(10);
});

test('formatAddress returns single-line address', () => {
  const b = getBusiness();
  expect(formatAddress(b)).toBe('76 Washington Street, Brighton, MA 02135');
});
