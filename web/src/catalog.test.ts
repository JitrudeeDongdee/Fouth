import { describe, expect, it } from 'vitest'
import { brandsOf, CATEGORIES, presetFromModel, type Category } from './catalog'

describe('appliance catalog', () => {
  it('gives every category a no-brand default to fall back on', () => {
    for (const c of CATEGORIES) expect(c.generic.length, c.id).toBeGreaterThan(0)
  })

  it('cites an https manufacturer page and a positive figure for every brand model', () => {
    for (const c of CATEGORIES) {
      for (const m of c.models) {
        const label = `${c.id} ${m.brand} ${m.model}`
        expect(m.source, label).toMatch(/^https:\/\//)
        expect(m.brand.trim(), label).not.toBe('')
        expect(m.model.trim(), label).not.toBe('')
        const figures = Object.values(m.spec)
        expect(figures.length, label).toBeGreaterThan(0)
        for (const f of figures) expect(Number(f), label).toBeGreaterThan(0)
      }
    }
  })

  it('lists each model once per category', () => {
    for (const c of CATEGORIES) {
      const keys = c.models.map((m) => `${m.brand}|${m.model}`.toLowerCase())
      expect(new Set(keys).size, c.id).toBe(keys.length)
    }
  })

  it("builds a model's card from the category's usage and the maker's figure", () => {
    const aircon: Category = {
      ...CATEGORIES.find((c) => c.id === 'aircon')!,
      models: [{ brand: 'Acme', model: 'X12', description: '', spec: { btu: '12000', eer: '13.5' }, figure: '', source: 'https://acme.example' }],
    }
    const preset = presetFromModel(aircon, aircon.models[0])

    expect(preset.name).toBe('แอร์ Acme X12')
    expect(preset.btu).toBe('12000')
    expect(preset.eer).toBe('13.5')
    // Usage pattern stays the category's assumption, not the maker's.
    expect(preset.hoursPerDay).toBe(aircon.generic[0].hoursPerDay)
    expect(preset.loadPercent).toBe(aircon.generic[0].loadPercent)
    expect(brandsOf(aircon)).toEqual(['Acme'])
  })
})
