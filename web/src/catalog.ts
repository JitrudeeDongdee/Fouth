// The appliance picker's catalog: categories, each with a generic default and the brand
// models whose figures were checked against the manufacturer's own published spec.
import { PRESETS, type Preset } from './appliances'
import { BRAND_MODELS } from './catalog-data'
import type { IconName } from './Icon'

export type CategoryId =
  | 'aircon'
  | 'fridge'
  | 'tv'
  | 'fan'
  | 'bulb'
  | 'heater'
  | 'ricecooker'
  | 'washer'
  | 'computer'
  | 'other'

/** The figures a brand model overrides on its category's generic preset. */
export type ModelSpec = Partial<Pick<Preset, 'watts' | 'btu' | 'eer' | 'kwhPerYear'>>

/**
 * One model as its maker publishes it. Only the spec comes from the maker; how many
 * hours a day it runs is the category's generic assumption, which the user edits.
 */
export interface CatalogModel {
  brand: string
  model: string
  /** A short line telling similar models apart, e.g. "2 ประตู 7.4 คิว" or "55 นิ้ว". */
  description: string
  spec: ModelSpec
  /** What the figure is, as the maker states it, e.g. "typical on-mode". */
  figure: string
  /** The manufacturer page the figure was read from. */
  source: string
}

export interface Category {
  id: CategoryId
  name: string
  /** Prefix for a brand model's card name, e.g. "แอร์" in "แอร์ Daikin FTKQ12". */
  short: string
  icon: IconName
  /** No-brand starting points; the first is the default. */
  generic: Preset[]
  models: CatalogModel[]
}

const models = (id: CategoryId) => BRAND_MODELS[id] ?? []

export const CATEGORIES: Category[] = [
  { id: 'aircon', name: 'แอร์', short: 'แอร์', icon: 'aircon', generic: [PRESETS[0], PRESETS[1]], models: models('aircon') },
  { id: 'fridge', name: 'ตู้เย็น', short: 'ตู้เย็น', icon: 'fridge', generic: [PRESETS[2]], models: models('fridge') },
  { id: 'tv', name: 'ทีวี', short: 'ทีวี', icon: 'tv', generic: [PRESETS[3]], models: models('tv') },
  { id: 'fan', name: 'พัดลม', short: 'พัดลม', icon: 'fan', generic: [PRESETS[4]], models: models('fan') },
  { id: 'bulb', name: 'หลอดไฟ', short: 'หลอดไฟ', icon: 'bulb', generic: [PRESETS[5]], models: models('bulb') },
  {
    id: 'heater',
    name: 'เครื่องทำน้ำอุ่น',
    short: 'เครื่องทำน้ำอุ่น',
    icon: 'heater',
    generic: [PRESETS[6]],
    models: models('heater'),
  },
  { id: 'ricecooker', name: 'หม้อหุงข้าว', short: 'หม้อหุงข้าว', icon: 'ricecooker', generic: [PRESETS[7]], models: models('ricecooker') },
  { id: 'washer', name: 'เครื่องซักผ้า', short: 'เครื่องซักผ้า', icon: 'washer', generic: [PRESETS[8]], models: models('washer') },
  { id: 'computer', name: 'คอมพิวเตอร์', short: 'คอมพิวเตอร์', icon: 'computer', generic: [PRESETS[9]], models: models('computer') },
  { id: 'other', name: 'อื่น ๆ', short: 'อื่น ๆ', icon: 'plug', generic: [PRESETS[10]], models: [] },
]

/** The preset a brand model adds: its category's default usage with the maker's figure. */
export function presetFromModel(category: Category, model: CatalogModel): Preset {
  return {
    ...category.generic[0],
    ...model.spec,
    name: `${category.short} ${model.brand} ${model.model}`,
    category: category.id,
  }
}

/** A category's generic preset, tagged with the category so the card gets its icon. */
export const genericPreset = (category: Category, index = 0): Preset => ({ ...category.generic[index], category: category.id })

/**
 * The category a card belongs to. Cards added from the picker carry it; older cards (the
 * starter list, lists saved before categories) are matched by kind and name, and anything
 * that matches nothing is "อื่น ๆ".
 */
export function categoryOf(row: Pick<Preset, 'kind' | 'name' | 'category'>): CategoryId {
  if (row.category && CATEGORIES.some((c) => c.id === row.category)) return row.category
  if (row.kind === 'aircon') return 'aircon'
  const name = row.name.trim()
  const byName = CATEGORIES.find(
    (c) => c.id !== 'other' && (c.generic.some((g) => g.name === name) || name.startsWith(c.short)),
  )
  if (byName) return byName.id
  if (row.kind === 'label') return 'fridge'
  return 'other'
}

export const iconOf = (row: Pick<Preset, 'kind' | 'name' | 'category'>): IconName =>
  CATEGORIES.find((c) => c.id === categoryOf(row))?.icon ?? 'plug'

/** The brands in a category, in the order they first appear. */
export const brandsOf = (category: Category) => [...new Set(category.models.map((m) => m.brand))]

/** Lower-case, no surrounding space, Thai digits as Arabic: the form both sides are matched in. */
const normalise = (text: string) =>
  text.toLowerCase().replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d))).trim()

/**
 * Whether every word of [query] appears somewhere in [haystack], case-insensitively and
 * in any order, so "daikin 12" finds "Daikin FTKQ12XV2S". An empty query matches all.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const text = normalise(haystack)
  return normalise(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/** The words a model can be found by: its category, brand, model code and description. */
export const searchText = (category: Category, model: CatalogModel) =>
  [category.name, model.brand, model.model, model.description, ...Object.values(model.spec)].join(' ')

/** Every model, in any category, that matches [query]; in catalog order. */
export function searchModels(query: string): { category: Category; model: CatalogModel }[] {
  if (query.trim() === '') return []
  return CATEGORIES.flatMap((category) =>
    category.models.filter((model) => matchesQuery(searchText(category, model), query)).map((model) => ({ category, model })),
  )
}
