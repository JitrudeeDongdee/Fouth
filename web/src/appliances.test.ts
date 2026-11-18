import { describe, expect, it } from 'vitest'
import { copyRows, defaultRows, newRow, PRESETS, resumeIds, specSummary, splitByQuantity } from './appliances'

describe('specSummary', () => {
  it('describes each kind of appliance on one line', () => {
    expect(specSummary(newRow(PRESETS[0]))).toBe('12,000 BTU · EER 12 · 8 ชม./วัน · ทำงาน 70%')
    expect(specSummary(newRow(PRESETS[2]))).toBe('300 kWh/ปี')
    expect(specSummary(newRow(PRESETS[3]))).toBe('100 วัตต์ · 5 ชม./วัน')
  })

  it('describes one appliance per card, with no quantity', () => {
    expect(specSummary(newRow(PRESETS[5]))).toBe('10 วัตต์ · 6 ชม./วัน')
  })

  it('shows a dash for an empty field instead of 0', () => {
    expect(specSummary(newRow(PRESETS[10]))).toBe('– วัตต์ · – ชม./วัน')
  })
})

describe('lists saved when cards had a quantity', () => {
  it('repeats a card as many times as its quantity, so the saved bill is unchanged', () => {
    const saved = [
      { ...newRow(PRESETS[5]), quantity: '3' },
      { ...newRow(PRESETS[3]), quantity: '1' },
      { ...newRow(PRESETS[4]) }, // saved after quantity was dropped
    ]
    resumeIds(saved)
    const rows = splitByQuantity(saved)

    expect(rows.map((r) => r.name)).toEqual(['หลอดไฟ LED', 'หลอดไฟ LED', 'หลอดไฟ LED', 'ทีวี', 'พัดลม'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(rows.every((r) => !('quantity' in r))).toBe(true)
  })

  it('counts a missing, fractional or broken quantity as one', () => {
    const saved = ['', '2.5', 'abc', '0'].map((quantity) => ({ ...newRow(PRESETS[3]), quantity }))
    resumeIds(saved)
    expect(splitByQuantity(saved)).toHaveLength(4)
  })
})

describe('collapsed rows', () => {
  it('starts the default list collapsed and opens a newly added row', () => {
    expect(defaultRows().every((r) => r.collapsed)).toBe(true)
    expect(newRow(PRESETS[4]).collapsed).toBe(false)
  })
})

describe('copying a set for the A/B comparison', () => {
  it('gives every copied row a new id, so editing one set leaves the other alone', () => {
    const a = defaultRows()
    const b = copyRows(a)

    expect(b.map((r) => r.name)).toEqual(a.map((r) => r.name))
    expect(b.some((row) => a.some((other) => other.id === row.id))).toBe(false)
    b[0].name = 'changed'
    expect(a[0].name).not.toBe('changed')
  })

  it('resumes numbering above both saved sets, so a new row never reuses an id', () => {
    const a = defaultRows()
    const b = copyRows(a)
    // A reload hands both sets back; ids must continue past the highest one seen.
    resumeIds(a, b)
    const added = newRow(PRESETS[4])
    expect([...a, ...b].every((row) => row.id < added.id)).toBe(true)
  })
})
