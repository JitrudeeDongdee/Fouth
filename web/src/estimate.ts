import { ApplianceInput, estimateBill, type EstimateResult } from 'billing-engine'
import type { Row } from './appliances'

/** Calls the Kotlin billing engine with the form rows. */
export function estimate(rows: Row[], ftPerKwh: string, daysPerMonth: number): EstimateResult {
  const inputs = rows.map(
    (r) => new ApplianceInput(r.kind, r.name, r.quantity, r.watts, r.hoursPerDay, r.btu, r.eer, r.loadPercent, r.kwhPerYear),
  )
  return estimateBill(inputs, ftPerKwh, daysPerMonth)
}
