import {
  ApplianceInput,
  estimateBill,
  estimateFromUsage,
  smallHouseholdLimitKwh,
  tariffSchedules,
  utilities,
  type EstimateResult,
} from 'billing-engine'
import type { Row } from './appliances'

/** Calls the Kotlin billing engine with the form rows. */
export type Estimate = EstimateResult

export function estimate(rows: Row[], utility: string, ftPerKwh: string, daysPerMonth: number): EstimateResult {
  const inputs = rows.map(
    // One card is one appliance, so the engine's quantity is always 1.
    (r) => new ApplianceInput(r.kind, r.name, '1', r.watts, r.hoursPerDay, r.btu, r.eer, r.loadPercent, r.kwhPerYear),
  )
  return estimateBill(inputs, utility, ftPerKwh, daysPerMonth)
}

/**
 * The bill type codes each utility uses, read from the engine so the page never
 * hard-codes them (MEA calls them 1.1 / 1.2, PEA 1.1.1 / 1.1.2).
 */
export const tariffCodes: Record<string, { small: string; large: string }> = Object.fromEntries(
  utilities().map((u) => [u.code, { small: u.smallHousehold, large: u.largeHousehold }]),
)

/** kWh per month up to which the small-household rate applies, as the engine defines it. */
export { smallHouseholdLimitKwh }

/** Prices a month's usage typed in as kWh, on the same rules as [estimate]; no appliances. */
export function estimateKwh(totalKwh: string, utility: string, ftPerKwh: string): EstimateResult {
  return estimateFromUsage(totalKwh, utility, ftPerKwh)
}

/** The small- then large-household tariffs a utility uses now, every tier listed. */
export { tariffSchedules }
