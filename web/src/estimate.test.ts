import { describe, expect, it } from 'vitest'
import { newRow, PRESETS } from './appliances'
import { estimate, tariffCodes } from './estimate'

// Checks the page talks to the compiled Kotlin engine correctly. The pricing rules
// themselves are tested in billing-engine (commonTest, on JVM and JS).
describe('estimate', () => {
  const typicalHome = () => [
    newRow({ ...PRESETS[0], btu: '12000', eer: '12', hoursPerDay: '8', loadPercent: '70' }), // 168 kWh
    newRow({ ...PRESETS[2], kwhPerYear: '365' }), // 30 kWh
    newRow({ ...PRESETS[3], watts: '100', hoursPerDay: '5' }), // 15 kWh
  ]

  it('prices a typical home through the Kotlin engine', () => {
    const result = estimate(typicalHome(), 'PEA', '0.3972', 30)

    expect(result.error).toBe('')
    expect(result.totalKwh).toBe('213.00')
    expect(result.tariffCode).toBe('1.1.2')
    expect(result.energyCharge).toBe('654.06')
    expect(result.total).toBe('816.71')
    expect(result.appliances.map((a) => a.kwhPerMonth)).toEqual(['168.00', '30.00', '15.00'])
  })

  it('charges the same under MEA but names the tariff the way MEA does', () => {
    const pea = estimate(typicalHome(), 'PEA', '0.3972', 30)
    const mea = estimate(typicalHome(), 'MEA', '0.3972', 30)

    expect(mea.error).toBe('')
    expect(mea.tariffCode).toBe('1.2')
    expect(mea.total).toBe(pea.total)
  })

  it('exposes each utility\'s type codes to the page', () => {
    expect(tariffCodes.MEA).toEqual({ small: '1.1', large: '1.2' })
    expect(tariffCodes.PEA).toEqual({ small: '1.1.1', large: '1.1.2' })
  })

  it('rejects an unknown utility instead of guessing one', () => {
    const result = estimate(typicalHome(), 'EGAT', '0.3972', 30)
    expect(result.error).toContain('unknown utility')
  })

  it('reports bad input instead of throwing', () => {
    const result = estimate([newRow({ ...PRESETS[3], hoursPerDay: '30' })], 'PEA', '0.3972', 30)
    expect(result.error).toContain('hours per day')
  })

  it('reports text that is not a number', () => {
    const result = estimate([newRow({ ...PRESETS[3], watts: 'abc' })], 'PEA', '0.3972', 30)
    expect(result.error).toContain('not a number')
  })
})
