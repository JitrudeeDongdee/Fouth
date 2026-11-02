import { describe, expect, it } from 'vitest'
import { defaultRows, newRow, PRESETS, specSummary } from './appliances'

describe('specSummary', () => {
  it('describes each kind of appliance on one line', () => {
    expect(specSummary(newRow(PRESETS[0]))).toBe('12,000 BTU · EER 12 · 8 ชม./วัน · ทำงาน 70%')
    expect(specSummary(newRow(PRESETS[2]))).toBe('300 kWh/ปี')
    expect(specSummary(newRow(PRESETS[3]))).toBe('100 วัตต์ · 5 ชม./วัน')
  })

  it('adds the quantity only when there is more than one', () => {
    expect(specSummary(newRow(PRESETS[5]))).toBe('10 วัตต์ · 6 ชม./วัน · × 5 เครื่อง')
  })

  it('shows a dash for an empty field instead of 0', () => {
    expect(specSummary(newRow(PRESETS[10]))).toBe('– วัตต์ · – ชม./วัน')
  })
})

describe('collapsed rows', () => {
  it('starts the default list collapsed and opens a newly added row', () => {
    expect(defaultRows().every((r) => r.collapsed)).toBe(true)
    expect(newRow(PRESETS[4]).collapsed).toBe(false)
  })
})
