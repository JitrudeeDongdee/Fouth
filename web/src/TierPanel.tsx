import { smallHouseholdLimitKwh, type Estimate } from './estimate'
import { baht, price } from './format'

/** kWh per month up to which the estimate uses the small-household rate (the engine's limit). */
export const SMALL_HOUSEHOLD_LIMIT = Number(smallHouseholdLimitKwh())

/**
 * How the progressive rate priced one bill: every tier of the tariff as a step, the part
 * of each step the usage filled, and the sum each step contributes. Steps the usage does
 * not reach are shown greyed, so it is clear what the next unit would cost.
 */
export function TierPanel(props: {
  result: Estimate
  setLabel: string | null
  utilityShort: string
  smallCode: string
  largeCode: string
  /** Where "how tiered rates work" links to; omitted on that page itself. */
  learnHref?: string
  onLearn?: () => void
}) {
  const { result } = props
  if (result.error) {
    return (
      <div className="tier-panel panel">
        {props.setLabel && <span className="set-stamp plain">{props.setLabel}</span>}
        <p className="error">ข้อมูลไม่ถูกต้อง: {result.error}</p>
      </div>
    )
  }

  const tiers = result.tiers
  const total = Number(result.totalKwh)
  const prices = tiers.map((t) => Number(t.pricePerKwh))
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  // The step the last unit landed in; nothing used means the first.
  const current = tiers.reduce((last, t, i) => (Number(t.kwh) > 0 ? i : last), 0)
  const next = tiers[current + 1]
  const toNext = next ? Number(tiers[current].toKwh) - total : null
  const small = result.tariffCode === props.smallCode
  const fill = (t: (typeof tiers)[number]) =>
    t.toKwh === '' ? (Number(t.kwh) > 0 ? 1 : 0) : Number(t.kwh) / (Number(t.toKwh) - Number(t.fromKwh))
  const range = (t: (typeof tiers)[number]) => (t.toKwh === '' ? `${t.fromKwh} ขึ้นไป` : `${t.fromKwh}–${t.toKwh}`)

  return (
    <div className="tier-panel panel">
      <div className="tier-head">
        {props.setLabel && <span className="set-stamp plain">{props.setLabel}</span>}
        <span>
          <strong>{baht(result.totalKwh)} หน่วย</strong> · {props.utilityShort} อัตรา {result.tariffCode}
        </span>
      </div>

      <p className="tier-why">
        {small
          ? `ใช้ไม่เกิน ${SMALL_HOUSEHOLD_LIMIT} หน่วย จึงคิดอัตรา ${props.smallCode} (บ้านใช้ไฟน้อย ขั้นแรกแบ่งละเอียดกว่า)`
          : `ใช้เกิน ${SMALL_HOUSEHOLD_LIMIT} หน่วย จึงคิดอัตรา ${props.largeCode} (ขั้นแรกกว้างกว่า ค่าบริการสูงกว่า)`}
      </p>

      <div className="stairs" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {tiers.map((t, i) => {
          const rise = high === low ? 1 : (Number(t.pricePerKwh) - low) / (high - low)
          return (
            <div className={i === current ? 'step now' : 'step'} key={t.fromKwh}>
              <span className="step-price">฿{price(t.pricePerKwh)}</span>
              <div className="step-block" style={{ height: `${35 + rise * 65}%` }}>
                <div className="step-fill" style={{ width: `${Math.min(1, fill(t)) * 100}%` }} />
              </div>
              <span className="step-range">{range(t)}</span>
            </div>
          )
        })}
      </div>

      <table className="tier-table">
        <thead>
          <tr>
            <th>ขั้น</th>
            <th>หน่วยที่</th>
            <th>คิดเป็น</th>
            <th className="num">บาท</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => {
            const used = Number(t.kwh) > 0
            return (
              <tr key={t.fromKwh} className={used ? (i === current ? 'now' : '') : 'unused'}>
                <td>{i + 1}</td>
                <td>{range(t)}</td>
                <td>
                  {used ? (
                    <>
                      {baht(t.kwh)} × {price(t.pricePerKwh)}
                    </>
                  ) : (
                    <span className="small">ยังไม่ถึง · ฿{price(t.pricePerKwh)}/หน่วย</span>
                  )}
                </td>
                <td className="num">{used ? baht(t.amount) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>ค่าพลังงานไฟฟ้า</td>
            <td className="num">{baht(result.energyCharge)}</td>
          </tr>
        </tfoot>
      </table>

      <ul className="tier-notes">
        {next && toNext !== null && (
          <li>
            อีก <strong>{baht(toNext.toFixed(2))} หน่วย</strong> จะขึ้นขั้นที่ {current + 2} ซึ่งคิดหน่วยละ ฿
            {price(next.pricePerKwh)}
          </li>
        )}
        {small && (
          <li>
            ถ้าใช้เกิน {SMALL_HOUSEHOLD_LIMIT} หน่วย (อีก {baht(Math.max(0, SMALL_HOUSEHOLD_LIMIT - total).toFixed(2))} หน่วย)
            จะเปลี่ยนไปคิดอัตรา {props.largeCode} ทั้งเดือน
          </li>
        )}
        <li>แต่ละขั้นคิดเฉพาะหน่วยที่อยู่ในช่วงนั้น หน่วยแรก ๆ ยังคิดราคาขั้นต้นเสมอ ไม่ได้คิดราคาขั้นสูงทั้งหมด</li>
        <li>ยอดแต่ละขั้นปัดเป็นสตางค์เพื่อแสดงผล บิลปัดเศษครั้งเดียวที่ยอดรวมค่าพลังงาน</li>
      </ul>

      {props.learnHref && (
        <a
          className="learn-link"
          href={props.learnHref}
          onClick={(e) => {
            if (!props.onLearn || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            props.onLearn()
          }}
        >
          อ่านว่าค่าไฟขั้นบันไดคิดยังไง →
        </a>
      )}
    </div>
  )
}
