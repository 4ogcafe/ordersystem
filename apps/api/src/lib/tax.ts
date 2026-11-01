// Japanese consumption tax. Takeout food uses the reduced 8% rate; the admin can change it.
export const DEFAULT_TAX_RATE_PERCENT = 8;

export const taxRatePercent = (settings: { taxRatePercent?: number | null }) => settings.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT;

/** Tax on a tax-excluded amount, rounded down to the yen (the usual 切り捨て rule). */
export const consumptionTax = (amount: number, ratePercent: number) => Math.floor((amount * ratePercent) / 100);
