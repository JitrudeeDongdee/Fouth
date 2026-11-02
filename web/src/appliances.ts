// Form model for one appliance row, plus ready-made presets.
// Every number is kept as the string the user typed; the engine parses it exactly.

export type Kind = 'rated' | 'aircon' | 'label'

export interface Row {
  id: number
  kind: Kind
  name: string
  quantity: string
  watts: string
  hoursPerDay: string
  btu: string
  eer: string
  loadPercent: string
  kwhPerYear: string
  /** Shows only the one-line summary. Optional so lists saved before this field still load. */
  collapsed?: boolean
}

export type Preset = Omit<Row, 'id' | 'collapsed'> & { icon: string }

const blank = { quantity: '1', watts: '', hoursPerDay: '', btu: '', eer: '', loadPercent: '', kwhPerYear: '' }

// Typical figures for a Thai home. They are starting points; the user edits them.
export const PRESETS: Preset[] = [
  { ...blank, icon: '❄️', kind: 'aircon', name: 'แอร์ 12,000 BTU', btu: '12000', eer: '12', hoursPerDay: '8', loadPercent: '70' },
  { ...blank, icon: '❄️', kind: 'aircon', name: 'แอร์ 18,000 BTU', btu: '18000', eer: '12', hoursPerDay: '8', loadPercent: '70' },
  { ...blank, icon: '🧊', kind: 'label', name: 'ตู้เย็น 2 ประตู', kwhPerYear: '300' },
  { ...blank, icon: '📺', kind: 'rated', name: 'ทีวี', watts: '100', hoursPerDay: '5' },
  { ...blank, icon: '🌀', kind: 'rated', name: 'พัดลม', watts: '50', hoursPerDay: '8' },
  { ...blank, icon: '💡', kind: 'rated', name: 'หลอดไฟ LED', watts: '10', hoursPerDay: '6', quantity: '5' },
  { ...blank, icon: '🚿', kind: 'rated', name: 'เครื่องทำน้ำอุ่น', watts: '3500', hoursPerDay: '0.5' },
  { ...blank, icon: '🍚', kind: 'rated', name: 'หม้อหุงข้าว', watts: '700', hoursPerDay: '0.5' },
  { ...blank, icon: '👕', kind: 'rated', name: 'เครื่องซักผ้า', watts: '500', hoursPerDay: '1' },
  { ...blank, icon: '💻', kind: 'rated', name: 'คอมพิวเตอร์', watts: '200', hoursPerDay: '6' },
  { ...blank, icon: '🔌', kind: 'rated', name: 'อื่น ๆ', watts: '', hoursPerDay: '' },
]

export const KIND_LABEL: Record<Kind, string> = {
  rated: 'กำลังไฟ (วัตต์)',
  aircon: 'แอร์ (BTU / EER)',
  label: 'ฉลากประหยัดไฟ (kWh/ปี)',
}

let nextId = 1
export function newRow(preset: Preset, collapsed = false): Row {
  const { icon: _icon, ...fields } = preset
  return { ...fields, id: nextId++, collapsed }
}

const num = (text: string) => {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) ? n.toLocaleString('th-TH') : text || '–'
}

/** One line describing a row's spec, shown when the row is collapsed. */
export function specSummary(row: Row): string {
  const parts =
    row.kind === 'aircon'
      ? [`${num(row.btu)} BTU`, `EER ${num(row.eer)}`, `${num(row.hoursPerDay)} ชม./วัน`, `ทำงาน ${num(row.loadPercent)}%`]
      : row.kind === 'label'
        ? [`${num(row.kwhPerYear)} kWh/ปี`]
        : [`${num(row.watts)} วัตต์`, `${num(row.hoursPerDay)} ชม./วัน`]
  if (row.quantity.trim() !== '1') parts.push(`× ${num(row.quantity)} เครื่อง`)
  return parts.join(' · ')
}

export function restoreIds(rows: Row[]): Row[] {
  nextId = Math.max(0, ...rows.map((r) => r.id)) + 1
  return rows
}

/** The starter list opens collapsed so the page begins short; a row added later opens expanded. */
export const defaultRows = (): Row[] => [PRESETS[0], PRESETS[2], PRESETS[3], PRESETS[5]].map((p) => newRow(p, true))
