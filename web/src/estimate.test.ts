import { describe, expect, it } from 'vitest'
import { newRow, PRESETS } from './appliances'
import { estimate } from './estimate'

// Checks the page talks to the compiled Kotlin engine correctly. The pricing rules
// themselves are tested in billing-engine (commonTest, on JVM and JS).
describe('estimate', () => {
  it('prices a typical home through the Kotlin engine', () => {
    const rows = [
      newRow({ ...PRESETS[0], btu: '12000', eer: '12', hoursPerDay: '8', loadPercent: '70' }), // 168 kWh
      newRow({ ...PRESETS[2], kwhPerYear: '365' }), // 30 kWh
      newRow({ ...PRESETS[3], watts: '100', hoursPerDay: '5' }), // 15 kWh
    ]
    const result = estimate(rows, '0.3972', 30)

    expect(result.error).toBe('')
    expect(result.totalKwh).toBe('213.00')
    expect(result.tariffCode).toBe('1.1.2')
    expect(result.energyCharge).toBe('753.23')
    expect(result.total).toBe('922.82')
    expect(result.appliances.map((a) => a.kwhPerMonth)).toEqual(['168.00', '30.00', '15.00'])
  })

  it('reports bad input instead of throwing', () => {
    const result = estimate([newRow({ ...PRESETS[3], hoursPerDay: '30' })], '0.3972', 30)
    expect(result.error).toContain('hours per day')
  })

  it('reports text that is not a number', () => {
    const result = estimate([newRow({ ...PRESETS[3], watts: 'abc' })], '0.3972', 30)
    expect(result.error).toContain('not a number')
  })
})
