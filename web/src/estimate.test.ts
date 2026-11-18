import { describe, expect, it } from 'vitest'
import { newRow, PRESETS } from './appliances'
import { estimate, estimateKwh, estimateRows, rowProblem, tariffCodes, tariffSchedules } from './estimate'

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

  it('lists every tier of the tariff, including those the usage does not reach', () => {
    const result = estimate(typicalHome(), 'PEA', '0.3972', 30)

    // 213 kWh on 1.1.2: 200 @ 3.0000 = 600.00, 13 @ 4.1584 = 54.0592, none in 400+.
    expect(result.tiers.map((t) => [t.fromKwh, t.toKwh, t.pricePerKwh, t.kwh, t.amount])).toEqual([
      ['0', '200', '3', '200', '600.00'],
      ['200', '400', '4.1584', '13', '54.06'],
      ['400', '', '4.3583', '0', '0.00'],
    ])
  })

  it('prices usage typed in as kWh the same way as appliances that add up to it', () => {
    const viaAppliances = estimate(typicalHome(), 'PEA', '0.3972', 30)
    const viaKwh = estimateKwh('213', 'PEA', '0.3972')

    expect(viaKwh.error).toBe('')
    expect(viaKwh.appliances).toEqual([])
    expect(viaKwh.tariffCode).toBe(viaAppliances.tariffCode)
    expect(viaKwh.total).toBe(viaAppliances.total)
    expect(estimateKwh('-1', 'PEA', '0').error).not.toBe('')
    expect(estimateKwh('abc', 'PEA', '0').error).not.toBe('')
  })

  it('hands the page both rate tables in force, small household first', () => {
    const [small, large] = tariffSchedules('PEA')

    expect(small.code).toBe('1.1.1')
    expect(small.serviceCharge).toBe('8.19')
    expect(small.tiers.map((t) => t.toKwh)).toEqual(['15', '25', '200', '400', ''])
    expect(large.code).toBe('1.1.2')
    expect(large.tiers.map((t) => [t.fromKwh, t.pricePerKwh])).toEqual([
      ['0', '3'],
      ['200', '4.1584'],
      ['400', '4.3583'],
    ])
    expect(tariffSchedules('MEA').map((s) => s.code)).toEqual(['1.1', '1.2'])
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

  it('prices the good cards and sets a broken one aside, instead of voiding the bill', () => {
    const home = typicalHome()
    const broken = newRow({ ...PRESETS[3], name: 'ทีวีห้องนอน', watts: '' })
    const { result, problems, lineOf } = estimateRows([...home, broken], 'PEA', '0.3972', 30)

    // The bill is exactly the bill of the three good cards.
    expect(result.error).toBe('')
    expect(result.total).toBe(estimate(home, 'PEA', '0.3972', 30).total)
    expect([...problems.keys()]).toEqual([broken.id])
    expect(problems.get(broken.id)).toBe('ยังไม่ได้กรอก: กำลังไฟ')
    expect(home.map((r) => lineOf.get(r.id)?.kwhPerMonth)).toEqual(['168.00', '30.00', '15.00'])
    expect(lineOf.has(broken.id)).toBe(false)
  })

  it('still fails the whole bill for a problem every card shares', () => {
    const { result, problems } = estimateRows(typicalHome(), 'PEA', 'abc', 30)
    expect(result.error).not.toBe('')
    expect(problems.size).toBe(0)
  })

  it('explains a rejected card in Thai', () => {
    const tv = newRow(PRESETS[3])
    expect(rowProblem({ ...tv, watts: '', hoursPerDay: '' }, '')).toBe('ยังไม่ได้กรอก: กำลังไฟ, ใช้วันละ')
    expect(rowProblem({ ...tv, hoursPerDay: '30' }, 'ทีวี: hours per day must be 0..24')).toBe('ชั่วโมงใช้งานต่อวันต้องอยู่ระหว่าง 0–24')
    expect(rowProblem({ ...tv, watts: 'abc' }, 'ทีวี: "abc" is not a number')).toBe('มีช่องที่ไม่ใช่ตัวเลข')
    expect(rowProblem(tv, 'ทีวี: something new')).toBe('something new')
  })
})
