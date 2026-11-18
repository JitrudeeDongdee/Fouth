import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { copyRows, defaultRows, KIND_LABEL, newRow, PRESETS, resumeIds, specSummary, type Kind, type Row } from './appliances'
import { estimate, tariffCodes } from './estimate'

const STORAGE_KEY = 'fouth-estimator-v1'
// Ft announced for September–December 2026 (0.1623 บาท/หน่วย). It changes every four
// months, so it stays an editable field rather than a fixed rate.
const DEFAULT_FT = '0.1623'

/**
 * The two utilities that bill households in Thailand. They charge the same baht per
 * unit — what differs is the service area and the type code printed on the bill.
 */
const UTILITIES = [
  { code: 'MEA', name: 'การไฟฟ้านครหลวง', short: 'กฟน.', area: 'กรุงเทพฯ · นนทบุรี · สมุทรปราการ' },
  { code: 'PEA', name: 'การไฟฟ้าส่วนภูมิภาค', short: 'กฟภ.', area: '74 จังหวัดที่เหลือ' },
] as const

type UtilityCode = (typeof UTILITIES)[number]['code']

const DEFAULT_UTILITY: UtilityCode = 'PEA'

/** Quiet time after the last edit before the slip is reprinted, so typing does not reprint per keystroke. */
const PRINT_DELAY_MS = 600

const isUtilityCode = (value: unknown): value is UtilityCode => UTILITIES.some((u) => u.code === value)

/** The two sets the compare mode puts side by side. */
type SetId = 'a' | 'b'

const SET_IDS: SetId[] = ['a', 'b']

const SET_LABEL: Record<SetId, string> = { a: 'ชุด A', b: 'ชุด B' }

/** The two ways the result can be printed, chosen in the sidebar. */
const BILL_MODES = [
  { compare: false, title: 'บิลเดียว', detail: 'คิดจากเครื่องใช้ไฟฟ้าชุดเดียว' },
  { compare: true, title: 'เปรียบเทียบ 2 บิล', detail: 'ชุด A กับ B แยกคนละใบ' },
] as const

/** Below this width the layout is one column and the sidebar slides over the page. */
const NARROW = '(max-width: 860px)'

/** Whether the desktop sidebar is folded to a rail. A per-viewer convenience, kept apart from the bill data. */
const NAV_KEY = 'fouth-nav-collapsed'

function loadNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const onChange = () => setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}

type Estimate = ReturnType<typeof estimate>

interface Saved {
  /** Set A. Kept under the old name so a list saved before compare mode still loads. */
  rows: Row[]
  rowsB?: Row[]
  compare?: boolean
  ft: string
  days: string
  utility?: UtilityCode
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

/**
 * Money as whole satang. Two-decimal amounts of this size survive the multiply
 * exactly once rounded, so subtracting the two sets cannot leave 178.86999999999998.
 */
const satang = (text: string) => Math.round(Number(text) * 100)

const fromSatang = (amount: number) => (amount / 100).toFixed(2)

export default function App() {
  const saved = useMemo(() => {
    const state = load()
    // Resume id numbering above both sets before any new row is made.
    if (state) resumeIds(state.rows ?? [], state.rowsB ?? [])
    return state
  }, [])
  const [rowsA, setRowsA] = useState<Row[]>(() => saved?.rows ?? defaultRows())
  const [rowsB, setRowsB] = useState<Row[]>(() => saved?.rowsB ?? [])
  const [compare, setCompare] = useState(saved?.compare ?? false)
  const [editing, setEditing] = useState<SetId>('a')
  const [ft, setFt] = useState(saved?.ft ?? DEFAULT_FT)
  const [days, setDays] = useState(saved?.days ?? '30')
  // Saved state from before the utility picker existed has no utility field.
  const [utility, setUtility] = useState<UtilityCode>(() => {
    const code = saved?.utility
    return isUtilityCode(code) ? code : DEFAULT_UTILITY
  })

  useEffect(
    () => save({ rows: rowsA, rowsB, compare, ft, days, utility }),
    [rowsA, rowsB, compare, ft, days, utility],
  )

  // Set B exists only in compare mode, so outside it there is nothing to edit but A.
  const shown: SetId = compare ? editing : 'a'
  const rows = shown === 'a' ? rowsA : rowsB
  const setRows = shown === 'a' ? setRowsA : setRowsB

  const dayCount = Number.parseInt(days, 10)
  const validDays = Number.isFinite(dayCount) ? dayCount : 0
  const resultA = useMemo(() => estimate(rowsA, utility, ft, validDays), [rowsA, utility, ft, validDays])
  const resultB = useMemo(
    () => (compare ? estimate(rowsB, utility, ft, validDays) : null),
    [compare, rowsB, utility, ft, validDays],
  )
  const result = shown === 'b' && resultB ? resultB : resultA

  // Both sets are priced the same way, so the difference is the whole point of the mode.
  const difference =
    resultB && !resultA.error && !resultB.error ? satang(resultB.total) - satang(resultA.total) : null

  const startCompare = () => {
    // Start B from a copy of A: a side-by-side of a list against an empty one says nothing.
    setRowsB((current) => (current.length > 0 ? current : copyRows(rowsA)))
    setCompare(true)
    setEditing('b')
  }
  const stopCompare = () => {
    setCompare(false)
    setEditing('a')
  }
  const resetBfromA = () => setRowsB(copyRows(rowsA))

  // Sidebar: folds to an icon rail on a wide screen, slides over the page on a narrow one.
  const narrow = useNarrow()
  const [navCollapsed, setNavCollapsed] = useState(loadNavCollapsed)
  const [navOpen, setNavOpen] = useState(false)
  const firstNavItem = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const burger = useRef<HTMLButtonElement>(null)

  // A closed overlay menu is off screen; `inert` keeps it out of the tab order and
  // away from screen readers without waiting on the slide-out transition.
  useEffect(() => {
    const menu = sidebar.current
    if (!menu) return
    const closedOverlay = narrow && !navOpen
    menu.inert = closedOverlay
    // Closing while focus is inside the menu would strand it on a hidden element.
    if (closedOverlay && menu.contains(document.activeElement)) burger.current?.focus()
  }, [narrow, navOpen])

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, navCollapsed ? '1' : '0')
    } catch {
      // Storage can be unavailable; the sidebar then simply starts expanded.
    }
  }, [navCollapsed])

  // Going wide closes the overlay, so it is not still open the next time the window narrows.
  useEffect(() => {
    if (!narrow) setNavOpen(false)
  }, [narrow])

  useEffect(() => {
    if (!navOpen) return
    firstNavItem.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  const navExpanded = narrow ? navOpen : !navCollapsed
  const toggleNav = () => (narrow ? setNavOpen((o) => !o) : setNavCollapsed((c) => !c))
  // On a phone the menu covers the page, so picking anything in it also puts it away.
  const afterNav = () => narrow && setNavOpen(false)

  const chooseMode = (wantCompare: boolean) => {
    if (wantCompare && !compare) startCompare()
    if (!wantCompare && compare) stopCompare()
    afterNav()
  }

  const goTo = (id: string) => {
    afterNav()
    const target = document.getElementById(id)
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const chosenUtility = UTILITIES.find((u) => u.code === utility) ?? UTILITIES[1]
  // In compare mode both slips share one scale, so equal bars mean equal kWh across the two bills.
  const maxKwh = Math.max(
    1,
    ...[resultA, ...(resultB ? [resultB] : [])].flatMap((r) => (r.error ? [] : r.appliances.map((a) => Number(a.kwhPerMonth)))),
  )

  const update = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: number) => setRows((all) => all.filter((r) => r.id !== id))
  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed)
  const setAllCollapsed = (collapsed: boolean) => setRows((all) => all.map((r) => ({ ...r, collapsed })))
  // Rows and result lines come back in the same order, so a row's kWh is at its own index.
  const kwhOf = (index: number) => (result.error ? null : result.appliances[index]?.kwhPerMonth)

  // The slip is reprinted when anything it shows changes, but only once the edits stop.
  const feed = useRef<HTMLDivElement>(null)
  const firstPrint = useRef(true)
  const printedMode = useRef(compare)
  const [printing, setPrinting] = useState(false)
  const [printedAt, setPrintedAt] = useState(() => new Date())
  // Which set is being edited is not on the paper, so switching tabs does not reprint.
  const slipContents = JSON.stringify([rowsA, compare ? rowsB : null, utility, ft, days])

  useEffect(() => {
    // The first slip is already printed by the class the markup ships with, and so is
    // every slip a mode change mounts — reprinting those too would feed them twice.
    if (firstPrint.current || printedMode.current !== compare) {
      firstPrint.current = false
      printedMode.current = compare
      setPrintedAt(new Date())
      return
    }
    setPrinting(true)
    const timer = setTimeout(() => {
      setPrinting(false)
      setPrintedAt(new Date())
      // Restarting a CSS animation needs the class gone and the layout recomputed
      // before it goes back on; remounting instead would close the notes section.
      feed.current?.querySelectorAll<HTMLElement>('.receipt').forEach((sheet) => {
        sheet.classList.remove('feeding')
        void sheet.offsetWidth
        sheet.classList.add('feeding')
      })
    }, PRINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [slipContents, compare])

  const stamp = printedAt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

  // Printed once: on the single slip, or under the two slips in compare mode.
  const notes = (
    <details className="notes" id="how">
      <summary>คำนวณอย่างไร</summary>
      <ul>
        <li>เครื่องทั่วไป: วัตต์ × ชั่วโมงต่อวัน ÷ 1,000 × จำนวนวัน</li>
        <li>แอร์: BTU ÷ EER = วัตต์ แล้วคูณ % ที่คอมเพรสเซอร์ทำงาน (ค่าเริ่มต้น 70% เป็นการประมาณ)</li>
        <li>ตู้เย็น: kWh ต่อปีจากฉลากประหยัดไฟ ÷ 365 × จำนวนวัน</li>
        <li>
          ใช้ไม่เกิน 150 หน่วยคิดอัตรา {chosenUtility.short} {tariffCodes[utility].small} เกินคิด{' '}
          {tariffCodes[utility].large} (การไฟฟ้าจริงดูประวัติย้อนหลัง จึงเป็นการประมาณ)
        </li>
        <li>
          อัตราก้าวหน้าบ้านอยู่อาศัย เริ่มใช้บิลเดือน ก.ย. 2569 (200 หน่วยแรกไม่เกินหน่วยละ 3 บาท)
          กฟน. และ กฟภ. ใช้อัตราเดียวกัน ผลลัพธ์เป็นค่าโดยประมาณ ไม่ใช่บิลจริง
        </li>
      </ul>
    </details>
  )

  return (
    <div className={navCollapsed ? 'app nav-collapsed' : 'app'}>
      <header className="topbar">
        <button
          ref={burger}
          className="icon-btn burger"
          onClick={toggleNav}
          aria-expanded={navExpanded}
          aria-controls="sidebar"
          aria-label={navExpanded ? 'ปิดเมนู' : 'เปิดเมนู'}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="topbar-brand">Fouth · คำนวณค่าไฟบ้าน</span>
        <span className="topbar-mode">{compare ? 'เปรียบเทียบ 2 บิล' : 'บิลเดียว'}</span>
      </header>

      {narrow && navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside
        ref={sidebar}
        id="sidebar"
        className={narrow && navOpen ? 'sidebar open' : 'sidebar'}
        aria-label="เมนู"
      >
        <nav>
          <p className="nav-label">รูปแบบบิล</p>
          <ul className="nav-list">
            {BILL_MODES.map((m, i) => (
              <li key={m.title}>
                <button
                  ref={i === 0 ? firstNavItem : undefined}
                  className={compare === m.compare ? 'nav-item on' : 'nav-item'}
                  aria-current={compare === m.compare ? 'true' : undefined}
                  title={m.title}
                  onClick={() => chooseMode(m.compare)}
                >
                  <span className={m.compare ? 'mode-pic two' : 'mode-pic'} aria-hidden="true">
                    <span />
                    {m.compare && <span />}
                  </span>
                  <span className="nav-text">
                    <span className="nav-title">{m.title}</span>
                    <span className="nav-detail">{m.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="nav-label">ไปที่</p>
          <ul className="nav-list">
            {[
              { id: 'appliances-title', icon: '🔌', title: 'เครื่องใช้ไฟฟ้า' },
              { id: 'result', icon: '🧾', title: 'ผลคำนวณ' },
              { id: 'how', icon: 'ℹ️', title: 'วิธีคำนวณ' },
            ].map((link) => (
              <li key={link.id}>
                <button className="nav-item" title={link.title} onClick={() => goTo(link.id)}>
                  <span className="nav-icon" aria-hidden="true">
                    {link.icon}
                  </span>
                  <span className="nav-text">
                    <span className="nav-title">{link.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {!narrow && (
          <button className="nav-fold" onClick={() => setNavCollapsed((c) => !c)} aria-label={navCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}>
            <span aria-hidden="true">{navCollapsed ? '»' : '«'}</span>
            <span className="nav-text">ย่อเมนู</span>
          </button>
        )}
      </aside>

      <div className="page">
        <header className="hero">
          <h1>คำนวณค่าไฟบ้านโดยประมาณ</h1>
          <p>
            ใส่เครื่องใช้ไฟฟ้าในบ้าน สเปค และชั่วโมงใช้งานต่อวัน ระบบจะคำนวณหน่วยไฟต่อเดือน
            แล้วคิดค่าไฟด้วยอัตราก้าวหน้า ค่า Ft และ VAT 7%
          </p>
        </header>

        <main className={compare ? 'layout comparing' : 'layout'}>
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

            {compare && (
              <div className="compare-bar">
                <div className="tabs" role="tablist" aria-label="ชุดที่กำลังแก้">
                  {SET_IDS.map((id) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={shown === id}
                      className={shown === id ? 'tab on' : 'tab'}
                      onClick={() => setEditing(id)}
                    >
                      {SET_LABEL[id]}
                    </button>
                  ))}
                </div>
                <button className="link-btn" onClick={resetBfromA}>
                  คัดลอก A → B
                </button>
              </div>
            )}

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
              <div className="utility">
                <span className="field-label" id="utility-label">
                  การไฟฟ้าที่ออกบิล
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="utility-label">
                  {UTILITIES.map((u) => (
                    <button
                      key={u.code}
                      type="button"
                      role="radio"
                      aria-checked={utility === u.code}
                      className={utility === u.code ? 'seg on' : 'seg'}
                      onClick={() => setUtility(u.code)}
                    >
                      <span className="seg-name">
                        {u.short} {u.name}
                      </span>
                      <span className="seg-area">{u.area}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Field label="จำนวนวันในเดือน" unit="วัน" value={days} onChange={setDays} />
              <Field label="ค่า Ft" unit="บาท/หน่วย" value={ft} onChange={setFt} />
            </div>
            <p className="hint">
              กฟน. กับ กฟภ. คิดค่าไฟหน่วยละเท่ากัน ต่างกันที่รหัสประเภทบนบิล · ค่า Ft
              เปลี่ยนทุก 4 เดือน ค่าเริ่มต้นคืองวด ก.ย.–ธ.ค. 2569
            </p>
          </section>

          <section className="printer" id="result" aria-labelledby="result-title">
            <h2 id="result-title" className="visually-hidden">
              ค่าไฟโดยประมาณต่อเดือน
            </h2>
            <div className="printer-head" aria-hidden="true">
              <span className="printer-brand">Fouth · เครื่องคิดค่าไฟ</span>
              <span className={printing ? 'printer-led busy' : 'printer-led'} />
            </div>

            {/* A mode change mounts fresh slips, which feed in from the class they ship with. */}
            <div className={compare ? 'slips two' : 'slips'} ref={feed} key={compare ? 'compare' : 'single'}>
              {(compare ? SET_IDS : (['a'] as SetId[])).map((id) => (
                <div className="slip-col" key={id}>
                  <div className="printer-slot" aria-hidden="true" />
                  <div className="paper-feed" aria-live="polite">
                    <Slip
                      result={id === 'a' ? resultA : (resultB ?? resultA)}
                      setLabel={compare ? SET_LABEL[id] : null}
                      editing={compare && shown === id}
                      onEdit={() => setEditing(id)}
                      meta={`${chosenUtility.short} · ${days} วัน · Ft ${ft}`}
                      stamp={stamp}
                      utilityShort={chosenUtility.short}
                      maxKwh={maxKwh}
                    >
                      {!compare && notes}
                    </Slip>
                  </div>
                </div>
              ))}
            </div>

            {compare && (
              <div className="compare-summary panel" aria-live="polite">
                <h3>ผลเทียบ</h3>
                {difference === null ? (
                  <p className="muted">ยังเทียบไม่ได้ เพราะข้อมูลชุดใดชุดหนึ่งไม่ถูกต้อง</p>
                ) : (
                  <p className={difference === 0 ? 'diff' : difference < 0 ? 'diff saving' : 'diff more'}>
                    {difference === 0
                      ? 'สองชุดค่าไฟเท่ากัน'
                      : `ชุด B ${difference < 0 ? 'ถูกกว่า' : 'แพงกว่า'} ฿${baht(fromSatang(Math.abs(difference)))} ต่อเดือน · ฿${baht(
                          fromSatang(Math.abs(difference) * 12),
                        )} ต่อปี`}
                  </p>
                )}
                {notes}
              </div>
            )}
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}

/** One printed bill. Compare mode prints two of these, one per set. */
function Slip(props: {
  result: Estimate
  setLabel: string | null
  editing: boolean
  onEdit: () => void
  meta: string
  stamp: string
  utilityShort: string
  maxKwh: number
  children?: ReactNode
}) {
  const { result, setLabel } = props
  return (
    <div className={props.editing ? 'receipt feeding editing' : 'receipt feeding'}>
      {setLabel && (
        <div className="receipt-set">
          <span className="set-stamp">{setLabel}</span>
          {props.editing ? (
            <span className="small">● กำลังแก้ชุดนี้</span>
          ) : (
            <button className="link-btn small" onClick={props.onEdit}>
              แก้ชุดนี้
            </button>
          )}
        </div>
      )}
      <p className="receipt-title">ค่าไฟโดยประมาณต่อเดือน</p>
      <p className="receipt-meta">
        {props.meta}
        <br />
        พิมพ์เมื่อ {props.stamp}
      </p>

      {result.error ? (
        <p className="error">ข้อมูลไม่ถูกต้อง: {result.error}</p>
      ) : (
        <>
          <div className="total">
            <span className="total-baht">฿{baht(result.total)}</span>
            <span className="muted">
              {baht(result.totalKwh)} หน่วย (kWh) · {props.utilityShort} อัตรา {result.tariffCode}
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
                  <div className="bar" style={{ width: `${(Number(a.kwhPerMonth) / props.maxKwh) * 100}%` }} />
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

      {props.children}

      <div className="receipt-foot" aria-hidden="true">
        <div className="barcode" />
        <span>* ประมาณการ ไม่ใช่บิลจริง *</span>
      </div>
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
