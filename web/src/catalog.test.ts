import { describe, expect, it } from 'vitest'
import { brandsOf, CATEGORIES, categoryOf, genericPreset, matchesQuery, presetFromModel, searchModels, type Category } from './catalog'
import { defaultRows } from './appliances'

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

  it('tags picked cards with their category, so each card gets its icon', () => {
    const tv = CATEGORIES.find((c) => c.id === 'tv')!
    expect(genericPreset(tv).category).toBe('tv')
  })

  it('works out the category of cards saved before categories existed', () => {
    expect(defaultRows().map(categoryOf)).toEqual(['aircon', 'fridge', 'tv', 'bulb'])
    const row = (kind: 'rated' | 'aircon' | 'label', name: string) => ({ kind, name })
    expect(categoryOf(row('aircon', 'ห้องนอน'))).toBe('aircon')
    expect(categoryOf(row('rated', 'หลอดไฟ LED'))).toBe('bulb')
    expect(categoryOf(row('rated', 'ทีวี ห้องนั่งเล่น'))).toBe('tv')
    expect(categoryOf(row('label', 'ตู้แช่'))).toBe('fridge')
    expect(categoryOf(row('rated', 'ไดร์เป่าผม'))).toBe('other')
    // A stored category wins over the name.
    expect(categoryOf({ ...row('rated', 'ไดร์เป่าผม'), category: 'fan' })).toBe('fan')
  })

  it('matches every word of a search, in any order and case', () => {
    expect(matchesQuery('Daikin FTKQ12XV2S MAX INVERTER', 'daikin ftkq12')).toBe(true)
    expect(matchesQuery('Daikin FTKQ12XV2S', 'ftkq12 daikin')).toBe(true)
    expect(matchesQuery('Daikin FTKQ12XV2S', 'daikin 18')).toBe(false)
    expect(matchesQuery('พัดลมตั้งพื้น 16 นิ้ว', '๑๖ นิ้ว')).toBe(true)
    expect(matchesQuery('anything', '   ')).toBe(true)
  })

  it('searches every category at once, and finds nothing for an empty query', () => {
    expect(searchModels('')).toEqual([])
    const daikin = searchModels('daikin')
    expect(daikin.length).toBeGreaterThan(0)
    expect(daikin.every(({ model }) => model.brand === 'Daikin')).toBe(true)
    // A category name finds that category's models.
    expect(searchModels('ตู้เย็น').every(({ category }) => category.id === 'fridge')).toBe(true)
  })
})
