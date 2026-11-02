import { useEffect, useMemo, useState } from 'react'
import { defaultRows, KIND_LABEL, newRow, PRESETS, restoreIds, specSummary, type Kind, type Row } from './appliances'
import { estimate } from './estimate'

const STORAGE_KEY = 'fouth-estimator-v1'
// Illustrative Ft (PEA, Jan–Apr 2025). Ft changes every four months; the user can edit it.
const DEFAULT_FT = '0.3972'

interface Saved {
  rows: Row[]
  ft: string
  days: string
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function save(state: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable (private mode); the page still works without it.
  }
}

const baht = (text: string) => Number(text).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function App() {
  const saved = useMemo(load, [])
  const [rows, setRows] = useState<Row[]>(() => (saved ? restoreIds(saved.rows) : defaultRows()))
  const [ft, setFt] = useState(saved?.ft ?? DEFAULT_FT)
  const [days, setDays] = useState(saved?.days ?? '30')

  useEffect(() => save({ rows, ft, days }), [rows, ft, days])

  const dayCount = Number.parseInt(days, 10)
  const result = useMemo(() => estimate(rows, ft, Number.isFinite(dayCount) ? dayCount : 0), [rows, ft, dayCount])
  const maxKwh = Math.max(1, ...result.appliances.map((a) => Number(a.kwhPerMonth)))

  const update = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: number) => setRows((all) => all.filter((r) => r.id !== id))
  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed)
  const setAllCollapsed = (collapsed: boolean) => setRows((all) => all.map((r) => ({ ...r, collapsed })))
  // Rows and result lines come back in the same order, so a row's kWh is at its own index.
  const kwhOf = (index: number) => (result.error ? null : result.appliances[index]?.kwhPerMonth)

  return (
    <div className="page">
      <header className="hero">
        <h1>คำนวณค่าไฟบ้านโดยประมาณ</h1>
        <p>
          ใส่เครื่องใช้ไฟฟ้าในบ้าน สเปค และชั่วโมงใช้งานต่อวัน ระบบจะคำนวณหน่วยไฟต่อเดือน
          แล้วคิดค่าไฟด้วยอัตราก้าวหน้า ค่า Ft และ VAT 7%
        </p>
      </header>

      <main className="layout">
        <section className="panel" aria-labelledby="appliances-title">
          <div className="panel-head">
            <h2 id="appliances-title">เครื่องใช้ไฟฟ้า</h2>
            <span className="muted">{rows.length} รายการ</span>
            {rows.length > 0 && (
              <button className="link-btn" onClick={() => setAllCollapsed(!allCollapsed)}>
                {allCollapsed ? 'ขยายทั้งหมด' : 'ย่อทั้งหมด'}
              </button>
            )}
          </div>

          {rows.length === 0 && <p className="empty">ยังไม่มีเครื่องใช้ไฟฟ้า เลือกจากรายการด้านล่างเพื่อเริ่ม</p>}

          <ul className="rows">
            {rows.map((row, index) =>
              row.collapsed ? (
                <li key={row.id} className="row row-collapsed">
                  <button
                    className="row-summary"
                    aria-expanded="false"
                    onClick={() => update(row.id, { collapsed: false })}
                  >
                    <span className="chevron" aria-hidden="true">
                      ▸
                    </span>
                    <span className="summary-text">
                      <span className="summary-name">{row.name || 'ไม่มีชื่อ'}</span>
                      <span className="muted small">{specSummary(row)}</span>
                    </span>
                    {kwhOf(index) && <span className="summary-kwh">{kwhOf(index)} หน่วย</span>}
                  </button>
                  <button className="icon-btn" onClick={() => remove(row.id)} aria-label={`ลบ ${row.name}`}>
                    ✕
                  </button>
                </li>
              ) : (
              <li key={row.id} className="row">
                <div className="row-top">
                  <button
                    className="icon-btn chevron-btn"
                    aria-expanded="true"
                    aria-label={`ย่อ ${row.name}`}
                    onClick={() => update(row.id, { collapsed: true })}
                  >
                    ▾
                  </button>
                  <input
                    className="name"
                    aria-label="ชื่อเครื่องใช้ไฟฟ้า"
                    value={row.name}
                    onChange={(e) => update(row.id, { name: e.target.value })}
                  />
                  <button className="icon-btn" onClick={() => remove(row.id)} aria-label={`ลบ ${row.name}`}>
                    ✕
                  </button>
                </div>
                <label className="kind">
                  <span>คิดจาก</span>
                  <select value={row.kind} onChange={(e) => update(row.id, { kind: e.target.value as Kind })}>
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="fields">
                  {row.kind === 'rated' && (
                    <>
                      <Field label="กำลังไฟ" unit="วัตต์" value={row.watts} onChange={(v) => update(row.id, { watts: v })} />
                      <Field label="ใช้วันละ" unit="ชม." value={row.hoursPerDay} onChange={(v) => update(row.id, { hoursPerDay: v })} />
                    </>
                  )}
                  {row.kind === 'aircon' && (
                    <>
                      <Field label="ขนาด" unit="BTU" value={row.btu} onChange={(v) => update(row.id, { btu: v })} />
                      <Field label="EER" unit="" value={row.eer} onChange={(v) => update(row.id, { eer: v })} />
                      <Field label="ใช้วันละ" unit="ชม." value={row.hoursPerDay} onChange={(v) => update(row.id, { hoursPerDay: v })} />
                      <Field
                        label="คอมเพรสเซอร์ทำงาน"
                        unit="%"
                        value={row.loadPercent}
                        onChange={(v) => update(row.id, { loadPercent: v })}
                      />
                    </>
                  )}
                  {row.kind === 'label' && (
                    <Field label="ตามฉลาก" unit="kWh/ปี" value={row.kwhPerYear} onChange={(v) => update(row.id, { kwhPerYear: v })} />
                  )}
                  <Field label="จำนวน" unit="เครื่อง" value={row.quantity} onChange={(v) => update(row.id, { quantity: v })} />
                </div>
              </li>
              ),
            )}
          </ul>

          <div className="add">
            <h3>เพิ่มเครื่องใช้ไฟฟ้า</h3>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p.name} className="chip" onClick={() => setRows((all) => [...all, newRow(p)])}>
                  <span aria-hidden="true">{p.icon}</span> {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings">
            <Field label="จำนวนวันในเดือน" unit="วัน" value={days} onChange={setDays} />
            <Field label="ค่า Ft" unit="บาท/หน่วย" value={ft} onChange={setFt} />
          </div>
          <p className="hint">
            ค่า Ft เปลี่ยนทุก 4 เดือน ค่าเริ่มต้นเป็นตัวอย่าง ตรวจค่าล่าสุดได้ที่เว็บไซต์ กฟภ. หรือ กฟน.
          </p>
        </section>

        <section className="panel result" aria-live="polite" aria-labelledby="result-title">
          <h2 id="result-title">ค่าไฟโดยประมาณต่อเดือน</h2>
          {result.error ? (
            <p className="error">ข้อมูลไม่ถูกต้อง: {result.error}</p>
          ) : (
            <>
              <div className="total">
                <span className="total-baht">฿{baht(result.total)}</span>
                <span className="muted">
                  {baht(result.totalKwh)} หน่วย (kWh) · อัตรา {result.tariffCode}
                </span>
              </div>

              <h3>ใช้ไฟจากอะไรบ้าง</h3>
              <ul className="bars">
                {result.appliances.map((a, i) => (
                  <li key={i}>
                    <div className="bar-label">
                      <span>{a.name}</span>
                      <span className="muted">
                        {baht(a.kwhPerMonth)} หน่วย · ~฿{baht(a.bahtShare)}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div className="bar" style={{ width: `${(Number(a.kwhPerMonth) / maxKwh) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>

              <h3>รายละเอียดบิล</h3>
              <table className="bill">
                <tbody>
                  {result.energyLines.map((l) => (
                    <tr key={l.label}>
                      <td>
                        หน่วยที่ {l.label}
                        <span className="muted small">
                          {' '}
                          {l.kwh} × {l.pricePerKwh}
                        </span>
                      </td>
                      <td className="num">{baht(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="sub">
                    <td>ค่าพลังงานไฟฟ้า</td>
                    <td className="num">{baht(result.energyCharge)}</td>
                  </tr>
                  <tr>
                    <td>ค่าบริการรายเดือน</td>
                    <td className="num">{baht(result.serviceCharge)}</td>
                  </tr>
                  <tr>
                    <td>ค่า Ft</td>
                    <td className="num">{baht(result.ftCharge)}</td>
                  </tr>
                  <tr className="sub">
                    <td>รวมก่อน VAT</td>
                    <td className="num">{baht(result.subtotal)}</td>
                  </tr>
                  <tr>
                    <td>VAT 7%</td>
                    <td className="num">{baht(result.vat)}</td>
                  </tr>
                  <tr className="grand">
                    <td>รวมทั้งสิ้น</td>
                    <td className="num">{baht(result.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <details className="notes">
            <summary>คำนวณอย่างไร</summary>
            <ul>
              <li>เครื่องทั่วไป: วัตต์ × ชั่วโมงต่อวัน ÷ 1,000 × จำนวนวัน</li>
              <li>แอร์: BTU ÷ EER = วัตต์ แล้วคูณ % ที่คอมเพรสเซอร์ทำงาน (ค่าเริ่มต้น 70% เป็นการประมาณ)</li>
              <li>ตู้เย็น: kWh ต่อปีจากฉลากประหยัดไฟ ÷ 365 × จำนวนวัน</li>
              <li>
                ใช้ไม่เกิน 150 หน่วยคิดอัตรา 1.1.1 เกินคิด 1.1.2 (การไฟฟ้าจริงดูประวัติย้อนหลัง จึงเป็นการประมาณ)
              </li>
              <li>อัตราค่าไฟตามตารางบ้านอยู่อาศัยของ กฟภ. (ม.ค. 2566) ผลลัพธ์เป็นค่าโดยประมาณ ไม่ใช่บิลจริง</li>
            </ul>
          </details>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function Field(props: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <span className="input-wrap">
        <input inputMode="decimal" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        {props.unit && <span className="unit">{props.unit}</span>}
      </span>
    </label>
  )
}

function Footer() {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    fetch('./version.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { version: string; sha: string } | null) => v && setVersion(`${v.version} · ${v.sha.slice(0, 7)}`))
      .catch(() => {})
  }, [])
  return (
    <footer className="footer">
      <span>คำนวณด้วย billing engine ที่เขียนด้วย Kotlin (คอมไพล์เป็น JavaScript)</span>
      {version && <span className="muted">เวอร์ชัน {version}</span>}
    </footer>
  )
}
