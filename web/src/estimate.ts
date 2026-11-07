import { ApplianceInput, estimateBill, utilities, type EstimateResult } from 'billing-engine'
import type { Row } from './appliances'

/** Calls the Kotlin billing engine with the form rows. */
export function estimate(rows: Row[], utility: string, ftPerKwh: string, daysPerMonth: number): EstimateResult {
  const inputs = rows.map(
    (r) => new ApplianceInput(r.kind, r.name, r.quantity, r.watts, r.hoursPerDay, r.btu, r.eer, r.loadPercent, r.kwhPerYear),
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
