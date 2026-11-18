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

// One card is one appliance, so the engine's quantity is always 1.
const toInput = (r: Row) => new ApplianceInput(r.kind, r.name, '1', r.watts, r.hoursPerDay, r.btu, r.eer, r.loadPercent, r.kwhPerYear)

export function estimate(rows: Row[], utility: string, ftPerKwh: string, daysPerMonth: number): EstimateResult {
  return estimateBill(rows.map(toInput), utility, ftPerKwh, daysPerMonth)
}

/** The fields each kind of card needs, with the labels the form shows. */
const REQUIRED: Record<Row['kind'], [keyof Row, string][]> = {
  rated: [
    ['watts', 'กำลังไฟ'],
    ['hoursPerDay', 'ใช้วันละ'],
  ],
  aircon: [
    ['btu', 'ขนาด BTU'],
    ['eer', 'EER'],
    ['hoursPerDay', 'ใช้วันละ'],
    ['loadPercent', 'คอมเพรสเซอร์ทำงาน'],
  ],
  label: [['kwhPerYear', 'kWh/ปี ตามฉลาก']],
}

/** The engine's reasons for rejecting one appliance, in the words the page uses. */
const ENGINE_REASONS: [RegExp, string][] = [
  [/is not a number/, 'มีช่องที่ไม่ใช่ตัวเลข'],
  [/hours per day must be 0\.\.24/, 'ชั่วโมงใช้งานต่อวันต้องอยู่ระหว่าง 0–24'],
  [/load factor must be 0\.\.1/, '% คอมเพรสเซอร์ทำงานต้องอยู่ระหว่าง 0–100'],
  [/BTU must be positive/, 'ขนาด BTU ต้องมากกว่า 0'],
  [/EER must be positive/, 'EER ต้องมากกว่า 0'],
  [/must not be negative/, 'ใส่ค่าติดลบไม่ได้'],
]

/**
 * Why one card cannot be priced, in Thai: the empty fields it still needs, else the
 * engine's reason. The engine prefixes its message with the card's name; that is dropped.
 */
export function rowProblem(row: Row, engineError: string): string {
  const missing = REQUIRED[row.kind].filter(([field]) => String(row[field] ?? '').trim() === '').map(([, label]) => label)
  if (missing.length > 0) return `ยังไม่ได้กรอก: ${missing.join(', ')}`
  const known = ENGINE_REASONS.find(([pattern]) => pattern.test(engineError))
  if (known) return known[1]
  const colon = engineError.indexOf(': ')
  return colon >= 0 ? engineError.slice(colon + 2) : engineError
}

/** A set of cards priced with its broken cards set aside. */
export interface RowsEstimate {
  /** The bill of every card that could be priced; its error is only for a problem shared by all. */
  result: EstimateResult
  /** Card id → its kWh line on the bill, for the cards that were priced. */
  lineOf: Map<number, EstimateResult['appliances'][number]>
  /** Card id → why it was left out of the bill. */
  problems: Map<number, string>
}

/**
 * Prices a set of cards so that one broken card does not void the whole bill. Each card
 * is checked on its own first; the cards the engine rejects are left out and reported,
 * and the bill is the rest. A problem shared by every card (Ft, days, utility) is still
 * the bill's own error, since no card could be priced without it.
 */
export function estimateRows(rows: Row[], utility: string, ftPerKwh: string, daysPerMonth: number): RowsEstimate {
  const shared = estimateBill([], utility, ftPerKwh, daysPerMonth)
  if (shared.error) return { result: shared, lineOf: new Map(), problems: new Map() }

  const problems = new Map<number, string>()
  const priced: Row[] = []
  for (const row of rows) {
    const alone = estimateBill([toInput(row)], utility, ftPerKwh, daysPerMonth)
    if (alone.error) problems.set(row.id, rowProblem(row, alone.error))
    else priced.push(row)
  }
  const result = estimate(priced, utility, ftPerKwh, daysPerMonth)
  // Lines come back in the order the cards went in.
  const lineOf = new Map(result.error ? [] : priced.map((row, i) => [row.id, result.appliances[i]] as const))
  return { result, lineOf, problems }
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
