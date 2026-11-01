// Same rule as the API (apps/api/src/lib/tax.ts). Used only for the cart drawer's estimate;
// checkout always shows the server's own quote.
export const DEFAULT_TAX_RATE_PERCENT = 8;

export const taxRateOf = (settings: { taxRatePercent?: number | null } | null | undefined) =>
  settings?.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT;

export const consumptionTax = (amount: number, ratePercent: number) => Math.floor((amount * ratePercent) / 100);
