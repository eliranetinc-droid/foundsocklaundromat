import businessData from '../data/business.json';
import pricingData from '../data/pricing.json';

export type Business = typeof businessData;
export type Pricing = typeof pricingData;

export function getBusiness(): Business {
  return businessData;
}

export function getPricing(): Pricing {
  return pricingData;
}

export function formatAddress(b: Business): string {
  const { streetAddress, addressLocality, addressRegion, postalCode } = b.address;
  return `${streetAddress}, ${addressLocality}, ${addressRegion} ${postalCode}`;
}
