import { useMemo, useState, type MouseEvent } from 'react'
import { estimateKwh, tariffSchedules } from './estimate'
import { baht, price } from './format'
import { SMALL_HOUSEHOLD_LIMIT, TierPanel } from './TierPanel'

/** Usage figures worth trying: below, at and just past the switch, and two larger homes. */
const QUICK_KWH = ['50', '150', '151', '300', '500']

/** The worked misconception uses a fixed, typical month so the numbers stay put while reading. */
const MISREAD_KWH = '300'

const isUsage = (text: string) => text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= 0

/**
 * A page that explains the progressive (tiered) residential rate: what a tier is, how
 * the tariff is chosen, the rate tables, a box to price any usage, and the jump at 150
 * units. Every rate and amount comes from the engine; nothing here repeats a number.
 */
export function LearnPage(props: {
  utility: string
  utilityShort: string
  ft: string
  smallCode: string
  largeCode: string
  /** The calculator's current usage, offered as a starting point when it is valid. */
  myKwh: string | null
  backHref: string
  onBack: () => void
}) {
  const [kwh, setKwh] = useState(() => props.myKwh ?? '300')
  const schedules = useMemo(() => tariffSchedules(props.utility), [props.utility])
  const tried = useMemo(
    () => (isUsage(kwh) ? estimateKwh(kwh.trim(), props.utility, props.ft) : null),
    [kwh, props.utility, props.ft],
  )
  const misread = useMemo(() => estimateKwh(MISREAD_KWH, props.utility, props.ft), [props.utility, props.ft])
  const at150 = useMemo(() => estimateKwh(String(SMALL_HOUSEHOLD_LIMIT), props.utility, props.ft), [props.utility, props.ft])
  const at151 = useMemo(() => estimateKwh(String(SMALL_HOUSEHOLD_LIMIT + 1), props.utility, props.ft), [props.utility, props.ft])

  // The misconception: every unit at the price of the last tier reached.
  const misreadTop = misread.tiers.reduce((top, t) => (Number(t.kwh) > 0 ? t : top), misread.tiers[0])
  const misreadWrong = misreadTop ? (Number(MISREAD_KWH) * Number(misreadTop.pricePerKwh)).toFixed(2) : null
  const jump = !at150.error && !at151.error ? (Math.round(Number(at151.total) * 100) - Math.round(Number(at150.total) * 100)) / 100 : null

  const range = (from: string, to: string) => (to === '' ? `${from} ขึ้นไป` : `${from}–${to}`)
  const back = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    props.onBack()
  }

  return (
    <article className="learn">
      <a className="learn-back" href={props.backHref} onClick={back}>
        ← กลับไปหน้าคำนวณ
      </a>

      <header className="hero">
        <h1>ค่าไฟขั้นบันไดคิดยังไง</h1>
        <p>
          ค่าไฟบ้านอยู่อาศัยไม่ได้คิดหน่วยละเท่ากันทุกหน่วย แต่แบ่งเป็นช่วง ยิ่งใช้มาก หน่วยท้าย ๆ ยิ่งแพงขึ้น
          หน้านี้อธิบายทีละขั้น ด้วยอัตราจริงของ {props.utilityShort} ที่ใช้ตั้งแต่บิลเดือน ก.ย. 2569
        </p>
      </header>

      <section className="panel learn-section" aria-labelledby="learn-idea">
        <h2 id="learn-idea">หลักการ</h2>
        <ol className="learn-steps">
          <li>
            <strong>แบ่งหน่วยเป็นช่วง</strong> เช่น หน่วยที่ 0–15, 15–25, 25–200 แต่ละช่วงเรียกว่า "ขั้น"
          </li>
          <li>
            <strong>แต่ละขั้นมีราคาต่อหน่วยของตัวเอง</strong> ขั้นแรก ๆ ถูก ขั้นหลัง ๆ แพงกว่า
          </li>
          <li>
            <strong>เติมทีละขั้นจากล่างขึ้นบน</strong> หน่วยที่ใช้จะเติมขั้นแรกจนเต็มก่อน แล้วค่อยล้นไปขั้นถัดไป
          </li>
          <li>
            <strong>ค่าพลังงาน = ผลรวมของทุกขั้น</strong> (หน่วยในขั้น × ราคาของขั้นนั้น) แล้วจึงบวกค่าบริการ ค่า Ft และ VAT
          </li>
        </ol>
      </section>

      {!misread.error && misreadTop && misreadWrong && (
        <section className="panel learn-section" aria-labelledby="learn-misread">
          <h2 id="learn-misread">เข้าใจผิดบ่อย: ใช้มากแล้วทุกหน่วยแพงขึ้น</h2>
          <p>
            สมมุติเดือนนี้ใช้ {MISREAD_KWH} หน่วย หน่วยสุดท้ายตกอยู่ขั้น {range(misreadTop.fromKwh, misreadTop.toKwh)}{' '}
            ราคาหน่วยละ ฿{price(misreadTop.pricePerKwh)}
          </p>
          <div className="learn-compare">
            <div className="learn-card wrong">
              <span className="small">คิดผิด: ทุกหน่วยใช้ราคาขั้นสุดท้าย</span>
              <span className="learn-figure">฿{baht(misreadWrong)}</span>
              <span className="small">
                {MISREAD_KWH} × {price(misreadTop.pricePerKwh)}
              </span>
            </div>
            <div className="learn-card right">
              <span className="small">คิดถูก: แต่ละขั้นคิดราคาของขั้นนั้น</span>
              <span className="learn-figure">฿{baht(misread.energyCharge)}</span>
              <span className="small">
                {misread.tiers
                  .filter((t) => Number(t.kwh) > 0)
                  .map((t) => `${baht(t.kwh)} × ${price(t.pricePerKwh)}`)
                  .join(' + ')}
              </span>
            </div>
          </div>
          <p className="hint">ตัวเลขนี้เป็นค่าพลังงานไฟฟ้าอย่างเดียว ยังไม่รวมค่าบริการ ค่า Ft และ VAT</p>
        </section>
      )}

      <section className="panel learn-section" aria-labelledby="learn-which">
        <h2 id="learn-which">ใช้อัตราไหน</h2>
        <p>
          การไฟฟ้าดูจากปริมาณที่ใช้ บ้านที่ใช้ไม่เกิน {SMALL_HOUSEHOLD_LIMIT} หน่วยต่อเดือนคิดอัตรา{' '}
          <strong>{props.smallCode}</strong> ส่วนบ้านที่ใช้เกินคิดอัตรา <strong>{props.largeCode}</strong>{' '}
          ทั้งสองอัตราแบ่งขั้นไม่เหมือนกัน และค่าบริการรายเดือนไม่เท่ากัน
        </p>
        <div className="rate-tables">
          {schedules.map((s) => (
            <table className="tier-table rate-table" key={s.code}>
              <caption>
                อัตรา {s.code}{' '}
                <span className="muted small">
                  · {s.code === props.smallCode ? `ใช้ไม่เกิน ${SMALL_HOUSEHOLD_LIMIT} หน่วย` : `ใช้เกิน ${SMALL_HOUSEHOLD_LIMIT} หน่วย`}
                </span>
              </caption>
              <thead>
                <tr>
                  <th>ขั้น</th>
                  <th>หน่วยที่</th>
                  <th className="num">บาท/หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {s.tiers.map((t, i) => (
                  <tr key={t.fromKwh}>
                    <td>{i + 1}</td>
                    <td>{range(t.fromKwh, t.toKwh)}</td>
                    <td className="num">{price(t.pricePerKwh)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>ค่าบริการรายเดือน</td>
                  <td className="num">{baht(s.serviceCharge)}</td>
                </tr>
              </tfoot>
            </table>
          ))}
        </div>
        <p className="hint">
          การไฟฟ้าจริงดูประวัติการใช้ย้อนหลังด้วย เว็บนี้ตัดสินจากเดือนเดียวจึงเป็นการประมาณ · กฟน. และ กฟภ.
          คิดราคาเท่ากัน ต่างกันแค่รหัสอัตราบนบิล
        </p>
      </section>

      <section className="panel learn-section" aria-labelledby="learn-try">
        <h2 id="learn-try">ลองคำนวณเอง</h2>
        <div className="learn-try">
          <label className="field">
            <span className="field-label">ใช้ไฟเดือนละ</span>
            <span className="input-wrap">
              <input inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} aria-describedby="learn-try-hint" />
              <span className="unit">หน่วย</span>
            </span>
          </label>
          <div className="quick-row" role="group" aria-label="ตัวอย่างจำนวนหน่วย">
            {props.myKwh && (
              <button className={kwh === props.myKwh ? 'quick on' : 'quick'} onClick={() => setKwh(props.myKwh ?? '')}>
                บ้านของฉัน {baht(props.myKwh)}
              </button>
            )}
            {QUICK_KWH.map((q) => (
              <button key={q} className={kwh === q ? 'quick on' : 'quick'} onClick={() => setKwh(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <p className="hint" id="learn-try-hint">
          ใช้ {props.utilityShort} และค่า Ft {props.ft} ตามที่ตั้งไว้ในหน้าคำนวณ
        </p>

        {!tried ? (
          <p className="error">ใส่จำนวนหน่วยเป็นตัวเลขตั้งแต่ 0 ขึ้นไป</p>
        ) : tried.error ? (
          <p className="error">ข้อมูลไม่ถูกต้อง: {tried.error}</p>
        ) : (
          <div className="learn-result">
            <TierPanel
              result={tried}
              setLabel={null}
              utilityShort={props.utilityShort}
              smallCode={props.smallCode}
              largeCode={props.largeCode}
            />
            <table className="tier-table learn-bill">
              <caption>จากค่าพลังงานถึงยอดบิล</caption>
              <tbody>
                <tr>
                  <td>ค่าพลังงานไฟฟ้า (ผลรวมทุกขั้น)</td>
                  <td className="num">{baht(tried.energyCharge)}</td>
                </tr>
                <tr>
                  <td>ค่าบริการรายเดือน (อัตรา {tried.tariffCode})</td>
                  <td className="num">{baht(tried.serviceCharge)}</td>
                </tr>
                <tr>
                  <td>
                    ค่า Ft ({baht(tried.totalKwh)} × {props.ft})
                  </td>
                  <td className="num">{baht(tried.ftCharge)}</td>
                </tr>
                <tr>
                  <td>รวมก่อน VAT</td>
                  <td className="num">{baht(tried.subtotal)}</td>
                </tr>
                <tr>
                  <td>VAT 7%</td>
                  <td className="num">{baht(tried.vat)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>รวมทั้งสิ้น</td>
                  <td className="num">{baht(tried.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {jump !== null && (
        <section className="panel learn-section" aria-labelledby="learn-jump">
          <h2 id="learn-jump">
            จุดที่ควรรู้: {SMALL_HOUSEHOLD_LIMIT} → {SMALL_HOUSEHOLD_LIMIT + 1} หน่วย
          </h2>
          <p>
            ใช้เกิน {SMALL_HOUSEHOLD_LIMIT} หน่วยเพียงหน่วยเดียว ทั้งเดือนจะเปลี่ยนไปคิดอัตรา {props.largeCode}{' '}
            ซึ่งขั้นแรกกว้างกว่าและค่าบริการสูงกว่า ยอดบิลจึงกระโดด ไม่ได้เพิ่มแค่ราคาของหน่วยเดียว
          </p>
          <div className="learn-compare">
            <div className="learn-card">
              <span className="small">
                {SMALL_HOUSEHOLD_LIMIT} หน่วย · อัตรา {at150.tariffCode}
              </span>
              <span className="learn-figure">฿{baht(at150.total)}</span>
            </div>
            <div className="learn-card">
              <span className="small">
                {SMALL_HOUSEHOLD_LIMIT + 1} หน่วย · อัตรา {at151.tariffCode}
              </span>
              <span className="learn-figure">฿{baht(at151.total)}</span>
            </div>
          </div>
          <p>
            หน่วยที่ {SMALL_HOUSEHOLD_LIMIT + 1} ทำให้บิลเพิ่มขึ้น <strong>฿{baht(jump.toFixed(2))}</strong> (รวมค่า Ft
            และ VAT แล้ว)
          </p>
        </section>
      )}

      <section className="panel learn-section" aria-labelledby="learn-rest">
        <h2 id="learn-rest">ส่วนอื่นของบิล</h2>
        <ul className="learn-steps">
          <li>
            <strong>ค่าบริการรายเดือน</strong> จ่ายทุกเดือนแม้ไม่ได้ใช้ไฟ อัตรา {props.smallCode} กับ {props.largeCode}{' '}
            ไม่เท่ากัน (ดูตารางด้านบน)
          </li>
          <li>
            <strong>ค่า Ft</strong> คิดเท่ากันทุกหน่วย ไม่เป็นขั้นบันได ปรับทุก 4 เดือนตามต้นทุนเชื้อเพลิง ตอนนี้ตั้งไว้{' '}
            {props.ft} บาท/หน่วย
          </li>
          <li>
            <strong>VAT 7%</strong> คิดจากค่าพลังงาน + ค่าบริการ + ค่า Ft
          </li>
          <li>ผลลัพธ์ในเว็บนี้เป็นค่าประมาณ ไม่ใช่บิลจริง</li>
        </ul>
      </section>

      <a className="learn-back" href={props.backHref} onClick={back}>
        ← กลับไปหน้าคำนวณ
      </a>
    </article>
  )
}
