/** Display formatting. Values arrive from the engine as exact decimal strings. */

/** Baht or kWh with two decimals and Thai digit grouping, e.g. "1,247.52". */
export const baht = (text: string) =>
  Number(text).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A price per unit with the four decimals rates are published in, e.g. "4.1584". */
export const price = (text: string) => Number(text).toFixed(4)
