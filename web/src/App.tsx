import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  copyRows,
  defaultRows,
  KIND_LABEL,
  newRow,
  resumeIds,
  specSummary,
  splitByQuantity,
  type Kind,
  type Preset,
  type Row,
} from './appliances'
import { estimateRows, tariffCodes, type Estimate } from './estimate'
import { baht } from './format'
import { AppliancePicker } from './AppliancePicker'
import { iconOf } from './catalog'
import { Icon } from './Icon'
import { LearnPage } from './LearnPage'
import { currentTier, Stairs, tierRange } from './TierPanel'

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

/**
 * Which page is open lives in the URL, so a link opens the same page and the browser's
 * Back button steps between pages:
 *   ?mode=single | compare   one bill or two
 *   ?page=learn               the page explaining tiered rates (absent: the calculator)
 * A missing or unknown mode reads as "not given" and falls back to the one saved in
 * localStorage. A `view` parameter from older links is dropped.
 */
interface PageState {
  compare: boolean
  /** The page explaining tiered rates (`?page=learn`); the calculator when false. */
  learn: boolean
}

const modeParam = (compare: boolean) => (compare ? 'compare' : 'single')

function pageFromUrl(): { compare: boolean | null; learn: boolean } {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  return {
    compare: mode === 'compare' ? true : mode === 'single' ? false : null,
    learn: params.get('page') === 'learn',
  }
}

const urlMatches = (page: PageState) => {
  const params = new URLSearchParams(window.location.search)
  return (
    params.get('mode') === modeParam(page.compare) &&
    params.get('page') === (page.learn ? 'learn' : null) &&
    !params.has('view')
  )
}

/**
 * The current address with `mode` and `page` set, so any other query or hash is kept.
 * The learn page keeps `mode`, so going back lands on the mode the reader was in.
 */
function urlFor(page: PageState): string {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', modeParam(page.compare))
  url.searchParams.delete('view')
  if (page.learn) url.searchParams.set('page', 'learn')
  else url.searchParams.delete('page')
  return url.pathname + url.search + url.hash
}

/** A plain left click on an in-page link is handled by the page; anything else is the browser's. */
const isPlainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

/** One card on a slip's usage list: its kWh line, or why it was left out of the bill. */
interface UsageLine {
  id: number
  name: string
  line: Estimate['appliances'][number] | null
  problem: string | null
}

/** What the slip's usage section draws. A per-viewer display preference, not bill data. */
type UsageView = 'appliances' | 'tiers'

const USAGE_VIEWS: { id: UsageView; title: string }[] = [
  { id: 'appliances', title: 'ตามเครื่อง' },
  { id: 'tiers', title: 'ขั้นบันได' },
]

const USAGE_VIEW_KEY = 'fouth-slip-usage-view'

const isUsageView = (value: unknown): value is UsageView => value === 'appliances' || value === 'tiers'

/**
 * Each slip's choice, kept as `{"a": …, "b": …}`. A value saved before the choice was per
 * slip is a bare "tiers" / "appliances" string; it applies to both slips.
 */
function loadUsageViews(): Record<SetId, UsageView> {
  const fallback: Record<SetId, UsageView> = { a: 'appliances', b: 'appliances' }
  try {
    const raw = localStorage.getItem(USAGE_VIEW_KEY)
    if (raw === null) return fallback
    if (isUsageView(raw)) return { a: raw, b: raw }
    const saved = JSON.parse(raw) as Partial<Record<SetId, unknown>>
    return { a: isUsageView(saved.a) ? saved.a : 'appliances', b: isUsageView(saved.b) ? saved.b : 'appliances' }
  } catch {
    return fallback
  }
}

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


export default function App() {
  const saved = useMemo(() => {
    const state = load()
    if (!state) return null
    // Resume id numbering above both sets before any new row is made, then turn any card
    // saved with a quantity into that many one-appliance cards.
    resumeIds(state.rows ?? [], state.rowsB ?? [])
    return { ...state, rows: splitByQuantity(state.rows ?? []), rowsB: state.rowsB && splitByQuantity(state.rowsB) }
  }, [])
  const initial = useMemo(() => {
    const a = saved?.rows ?? defaultRows()
    // A link's ?mode= wins over the mode this browser last used.
    const compare = pageFromUrl().compare ?? saved?.compare ?? false
    const savedB = saved?.rowsB ?? []
    // Opening ?mode=compare with no set B yet starts B from a copy of A, as the menu does.
    const b = compare && savedB.length === 0 ? copyRows(a) : savedB
    return { a, b, compare }
  }, [saved])
  const [rowsA, setRowsA] = useState<Row[]>(initial.a)
  const [rowsB, setRowsB] = useState<Row[]>(initial.b)
  const [compare, setCompare] = useState(initial.compare)
  const [editing, setEditing] = useState<SetId>('a')
  // The learn page (?page=learn) is shown in place of the calculator.
  const [learn, setLearn] = useState(() => pageFromUrl().learn)
  // Each slip has its own bars/staircase choice, so set A can show one while B shows the other.
  const [usageViews, setUsageViews] = useState<Record<SetId, UsageView>>(loadUsageViews)
  useEffect(() => {
    try {
      localStorage.setItem(USAGE_VIEW_KEY, JSON.stringify(usageViews))
    } catch {
      // Storage can be unavailable; the slips then start with the appliance bars.
    }
  }, [usageViews])
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
  // Each set is priced with its broken cards set aside, so one bad card does not void the bill.
  const pricedA = useMemo(() => estimateRows(rowsA, utility, ft, validDays), [rowsA, utility, ft, validDays])
  const pricedB = useMemo(
    () => (compare ? estimateRows(rowsB, utility, ft, validDays) : null),
    [compare, rowsB, utility, ft, validDays],
  )
  const resultA = pricedA.result
  const resultB = pricedB?.result ?? null
  const priced = shown === 'b' && pricedB ? pricedB : pricedA
  /**
   * A set's cards in list order, each with its kWh line or, when it could not be priced,
   * the reason. The slip lists all of them, so a card left out still has its place.
   */
  const usageOf = (id: SetId): UsageLine[] => {
    const set = id === 'a' ? pricedA : pricedB
    const list = id === 'a' ? rowsA : rowsB
    if (!set) return []
    return list.map((r) => ({
      id: r.id,
      name: r.name || 'ไม่มีชื่อ',
      line: set.lineOf.get(r.id) ?? null,
      problem: set.problems.get(r.id) ?? null,
    }))
  }

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

  // Page → URL. The first write replaces the entry (the page's own address gains ?mode=),
  // later ones add an entry so Back returns to the previous page. A change that
  // came from Back/Forward already matches the URL, so it writes nothing.
  const urlSynced = useRef(false)
  useEffect(() => {
    const page = { compare, learn }
    if (!urlMatches(page)) {
      if (urlSynced.current) window.history.pushState(null, '', urlFor(page))
      else window.history.replaceState(null, '', urlFor(page))
    }
    urlSynced.current = true
  }, [compare, learn])

  // URL → page, when Back/Forward moves between entries.
  useEffect(() => {
    const onPop = () => {
      const fromUrl = pageFromUrl()
      setLearn(fromUrl.learn)
      if (fromUrl.compare === null || fromUrl.compare === compare) return
      if (fromUrl.compare) startCompare()
      else stopCompare()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Re-subscribed when the mode or set A changes, so startCompare copies the current A.
  }, [compare, rowsA])

  // Sidebar: folds to an icon rail on a wide screen, slides over the page on a narrow one.
  const narrow = useNarrow()
  const [navCollapsed, setNavCollapsed] = useState(loadNavCollapsed)
  const [navOpen, setNavOpen] = useState(false)
  const firstNavItem = useRef<HTMLAnchorElement>(null)
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
    setLearn(false)
    afterNav()
  }

  /** Opens or leaves the page explaining tiered rates, starting it at the top. */
  const openLearn = (open: boolean) => {
    afterNav()
    setLearn(open)
    window.scrollTo({ top: 0 })
  }

  const goTo = (id: string) => {
    afterNav()
    // Every target lives on the calculator; leave the learn page first and let it render.
    if (learn) {
      setLearn(false)
      window.setTimeout(() => goToNow(id), 0)
      return
    }
    goToNow(id)
  }

  const goToNow = (id: string) => {
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

  // The appliance picker is a native <dialog>: showModal() gives the focus trap, Esc and the backdrop.
  const picker = useRef<HTMLDialogElement>(null)
  const addedId = useRef<number | null>(null)
  const addPreset = (preset: Preset) => {
    const row = newRow(preset)
    addedId.current = row.id
    setRows((all) => [...all, row])
    // A card just added opens for editing, so its spec can be adjusted straight away.
    setEditingCards((open) => new Set(open).add(row.id))
    picker.current?.close()
  }
  // Bring the row just added into view: on a long list it lands below the fold.
  useEffect(() => {
    if (addedId.current === null) return
    document.querySelector(`[data-row-id="${addedId.current}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    addedId.current = null
  }, [rows])

  const update = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: number) => setRows((all) => all.filter((r) => r.id !== id))
  // Which cards are open for editing. Not saved: every card starts in view mode on load.
  const [editingCards, setEditingCards] = useState<Set<number>>(() => new Set())
  const startEdit = (id: number) => setEditingCards((open) => new Set(open).add(id))
  const finishEdit = (id: number) => {
    setEditingCards((open) => {
      const rest = new Set(open)
      rest.delete(id)
      return rest
    })
    // Hand focus back to the card's pencil, so the keyboard stays where it was.
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-row-id="${id}"] .edit-btn`)?.focus(),
    )
  }
  const kwhOf = (row: Row) => priced.lineOf.get(row.id)?.kwhPerMonth ?? null
  const problemOf = (row: Row) => priced.problems.get(row.id) ?? null

  // Each slip is reprinted when what it shows changes, but only once the edits stop.
  // Editing set A reprints only A's slip; the shared settings are on both, so they reprint both.
  // Which set is being edited is not on the paper, so switching tabs reprints nothing.
  const feed = useRef<HTMLDivElement>(null)
  const printedMode = useRef<boolean | null>(null)
  const printedContents = useRef<Record<SetId, string>>({ a: '', b: '' })
  const [printing, setPrinting] = useState(false)
  const [printedAt, setPrintedAt] = useState<Record<SetId, Date>>(() => ({ a: new Date(), b: new Date() }))
  // Whether a card is open is not on the paper, so opening or closing one reprints nothing.
  const onPaper = (list: Row[]) => list.map(({ collapsed: _open, ...card }) => card)
  const contents: Record<SetId, string> = {
    a: JSON.stringify([onPaper(rowsA), utility, ft, days]),
    b: JSON.stringify([onPaper(rowsB), utility, ft, days]),
  }

  useEffect(() => {
    // The slips on screen at first load, and every slip a mode change mounts, are already
    // printed by the class the markup ships with — reprinting those would feed them twice.
    if (printedMode.current !== compare) {
      printedMode.current = compare
      printedContents.current = { ...contents }
      setPrintedAt({ a: new Date(), b: new Date() })
      return
    }
    const changed = (compare ? SET_IDS : (['a'] as SetId[])).filter((id) => contents[id] !== printedContents.current[id])
    if (changed.length === 0) return
    setPrinting(true)
    const timer = setTimeout(() => {
      setPrinting(false)
      const now = new Date()
      setPrintedAt((at) => ({ ...at, ...Object.fromEntries(changed.map((id) => [id, now])) }))
      for (const id of changed) {
        printedContents.current[id] = contents[id]
        const sheet = feed.current?.querySelector<HTMLElement>(`.receipt[data-set="${id}"]`)
        if (!sheet) continue
        // Restarting a CSS animation needs the class gone and the layout recomputed
        // before it goes back on; remounting instead would close the notes section.
        sheet.classList.remove('feeding')
        void sheet.offsetWidth
        sheet.classList.add('feeding')
      }
    }, PRINT_DELAY_MS)
    return () => clearTimeout(timer)
    // `contents` is rebuilt every render; its two strings are the real dependencies.
  }, [contents.a, contents.b, compare])

  const stampOf = (id: SetId) => printedAt[id].toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

  // Each slip carries the notes; only the first has the id the sidebar's "วิธีคำนวณ" link targets.
  const notes = (withId: boolean) => (
    <details className="notes" id={withId ? 'how' : undefined}>
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
        <span className="topbar-mode">
          {learn ? 'ความรู้ค่าไฟ' : compare ? 'เปรียบเทียบ 2 บิล' : 'บิลเดียว'}
        </span>
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
                {/* A real link, so it can be copied or opened in a new tab; a plain click stays in the page. */}
                <a
                  ref={i === 0 ? firstNavItem : undefined}
                  href={urlFor({ compare: m.compare, learn: false })}
                  className={compare === m.compare ? 'nav-item on' : 'nav-item'}
                  aria-current={compare === m.compare ? 'page' : undefined}
                  title={m.title}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return
                    e.preventDefault()
                    chooseMode(m.compare)
                  }}
                >
                  <span className={m.compare ? 'mode-pic two' : 'mode-pic'} aria-hidden="true">
                    <span />
                    {m.compare && <span />}
                  </span>
                  <span className="nav-text">
                    <span className="nav-title">{m.title}</span>
                    <span className="nav-detail">{m.detail}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <p className="nav-label">ความรู้</p>
          <ul className="nav-list">
            <li>
              <a
                href={urlFor({ compare, learn: true })}
                className={learn ? 'nav-item on' : 'nav-item'}
                aria-current={learn ? 'page' : undefined}
                title="ค่าไฟขั้นบันไดคิดยังไง"
                onClick={(e) => {
                  if (!isPlainClick(e)) return
                  e.preventDefault()
                  openLearn(true)
                }}
              >
                <span className="nav-icon">
                  <Icon name="book" size={22} />
                </span>
                <span className="nav-text">
                  <span className="nav-title">ค่าไฟขั้นบันไดคิดยังไง</span>
                  <span className="nav-detail">อธิบายทีละขั้น ลองใส่หน่วยเอง</span>
                </span>
              </a>
            </li>
          </ul>

          <p className="nav-label">ไปที่</p>
          <ul className="nav-list">
            {[
              { id: 'appliances-title', icon: 'list' as const, title: 'เครื่องใช้ไฟฟ้า' },
              { id: 'result', icon: 'receipt' as const, title: 'ผลคำนวณ' },
              { id: 'how', icon: 'info' as const, title: 'วิธีคำนวณ' },
            ].map((link) => (
              <li key={link.id}>
                <button className="nav-item" title={link.title} onClick={() => goTo(link.id)}>
                  <span className="nav-icon">
                    <Icon name={link.icon} size={22} />
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
        {learn && (
          <LearnPage
            utility={utility}
            utilityShort={chosenUtility.short}
            ft={ft}
            smallCode={tariffCodes[utility].small}
            largeCode={tariffCodes[utility].large}
            myKwh={resultA.error ? null : resultA.totalKwh}
            backHref={urlFor({ compare, learn: false })}
            onBack={() => openLearn(false)}
          />
        )}

        {/* The calculator stays mounted behind the learn page, so nothing typed is lost. */}
        <header className="hero" hidden={learn}>
          <h1>คำนวณค่าไฟบ้านโดยประมาณ</h1>
          <p>
            ใส่เครื่องใช้ไฟฟ้าในบ้าน สเปค และชั่วโมงใช้งานต่อวัน ระบบจะคำนวณหน่วยไฟต่อเดือน
            แล้วคิดค่าไฟด้วยอัตราก้าวหน้า ค่า Ft และ VAT 7%
          </p>
        </header>

        <main className={compare ? 'layout comparing' : 'layout'} hidden={learn}>
          <section className="panel" aria-labelledby="appliances-title">
            <div className="panel-head">
              <h2 id="appliances-title">เครื่องใช้ไฟฟ้า</h2>
              <span className="muted">{rows.length} รายการ</span>
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
              {rows.map((row) =>
                !editingCards.has(row.id) ? (
                  // View mode: values only, nothing to type into, so a tap never lands in a field.
                  <li key={row.id} className={problemOf(row) ? 'row row-view row-invalid' : 'row row-view'} data-row-id={row.id}>
                    <Icon name={iconOf(row)} size={26} className="row-icon" />
                    <span className="summary-text">
                      <span className="summary-name">{row.name || 'ไม่มีชื่อ'}</span>
                      <span className="muted small">{specSummary(row)}</span>
                    </span>
                    {problemOf(row) ? (
                      <span className="summary-skip" title={problemOf(row) ?? undefined}>
                        ไม่ได้นำมาคิด
                      </span>
                    ) : (
                      kwhOf(row) && <span className="summary-kwh">{kwhOf(row)} หน่วย</span>
                    )}
                    <button className="icon-btn edit-btn" onClick={() => startEdit(row.id)} aria-label={`แก้ไข ${row.name}`} title="แก้ไข">
                      <Icon name="pencil" size={18} />
                    </button>
                    <button className="icon-btn" onClick={() => remove(row.id)} aria-label={`ลบ ${row.name}`} title="ลบ">
                      ✕
                    </button>
                  </li>
                ) : (
                <li
                  key={row.id}
                  className={problemOf(row) ? 'row row-editing row-invalid' : 'row row-editing'}
                  data-row-id={row.id}
                  // Enter in a text field saves, as the บันทึก button does.
                  onKeyDown={(e) => e.key === 'Enter' && e.target instanceof HTMLInputElement && finishEdit(row.id)}
                >
                  <div className="row-top">
                    <Icon name={iconOf(row)} size={26} className="row-icon" />
                    <input
                      className="name"
                      aria-label="ชื่อเครื่องใช้ไฟฟ้า"
                      value={row.name}
                      onChange={(e) => update(row.id, { name: e.target.value })}
                    />
                    <button className="save-btn" onClick={() => finishEdit(row.id)}>
                      <Icon name="check" size={16} />
                      บันทึก
                    </button>
                    <button className="icon-btn" onClick={() => remove(row.id)} aria-label={`ลบ ${row.name}`} title="ลบ">
                      ✕
                    </button>
                  </div>
                  {problemOf(row) && (
                    <p className="row-problem" role="status">
                      {problemOf(row)} · ยังไม่ได้นำการ์ดนี้มาคิดในบิล
                    </p>
                  )}
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
                  </div>
                </li>
                ),
              )}
            </ul>

            <button className="add-btn" aria-haspopup="dialog" onClick={() => picker.current?.showModal()}>
              <span className="add-plus" aria-hidden="true">
                +
              </span>
              เพิ่มเครื่องใช้ไฟฟ้า{compare ? ` ลง${SET_LABEL[shown]}` : ''}
            </button>

            <AppliancePicker dialog={picker} target={compare ? `ลง${SET_LABEL[shown]}` : null} onPick={addPreset} />

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
                      set={id}
                      result={id === 'a' ? resultA : (resultB ?? resultA)}
                      usage={usageOf(id)}
                      setLabel={compare ? SET_LABEL[id] : null}
                      editing={compare && shown === id}
                      onEdit={() => setEditing(id)}
                      meta={`${chosenUtility.short} · ${days} วัน · Ft ${ft}`}
                      stamp={stampOf(id)}
                      utilityShort={chosenUtility.short}
                      maxKwh={maxKwh}
                      usageView={usageViews[id]}
                      onUsageView={(view) => setUsageViews((all) => ({ ...all, [id]: view }))}
                      learnHref={urlFor({ compare, learn: true })}
                      onLearn={() => openLearn(true)}
                    >
                      {notes(id === 'a')}
                    </Slip>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}

/** One printed bill. Compare mode prints two of these, one per set. */
function Slip(props: {
  set: SetId
  result: Estimate
  setLabel: string | null
  editing: boolean
  onEdit: () => void
  meta: string
  stamp: string
  utilityShort: string
  maxKwh: number
  /** What the usage section of the slip draws: kWh per appliance, or the tier staircase. */
  usageView: UsageView
  onUsageView: (view: UsageView) => void
  /** Every card of this set in list order, priced or left out. */
  usage: UsageLine[]
  /** The page explaining tiered rates, linked from the staircase. */
  learnHref: string
  onLearn: () => void
  children?: ReactNode
}) {
  const { result, setLabel } = props
  const top = result.error ? null : result.tiers[currentTier(result.tiers)]
  return (
    <div className={props.editing ? 'receipt feeding editing' : 'receipt feeding'} data-set={props.set}>
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

          <div className="usage-head">
            <h3>{props.usageView === 'appliances' ? 'ใช้ไฟจากอะไรบ้าง' : 'ใช้ไฟถึงขั้นไหน'}</h3>
            <div className="usage-toggle" role="group" aria-label="แสดงการใช้ไฟแบบ">
              {USAGE_VIEWS.map((v) => (
                <button
                  key={v.id}
                  className={props.usageView === v.id ? 'on' : ''}
                  aria-pressed={props.usageView === v.id}
                  onClick={() => props.onUsageView(v.id)}
                >
                  {v.title}
                </button>
              ))}
            </div>
          </div>
          {props.usageView === 'appliances' ? (
            // One grid for the whole list, so the name, units and baht columns line up row to row.
            <ul className="bars" aria-label="การใช้ไฟของแต่ละเครื่อง">
              <li className="bars-head" aria-hidden="true">
                <span />
                <span className="num">หน่วย</span>
                <span className="num">~บาท</span>
              </li>
              {props.usage.map((u) =>
                u.line ? (
                  <li key={u.id}>
                    <span className="bar-name">{u.name}</span>
                    <span className="num">{baht(u.line.kwhPerMonth)}</span>
                    <span className="num">{baht(u.line.bahtShare)}</span>
                    <div className="bar-track">
                      <div className="bar" style={{ width: `${(Number(u.line.kwhPerMonth) / props.maxKwh) * 100}%` }} />
                    </div>
                  </li>
                ) : (
                  // Left out of the bill: same place in the list, no figures, an empty bar.
                  <li key={u.id} className="bar-skipped" title={u.problem ?? undefined}>
                    <span className="bar-name">{u.name}</span>
                    <span className="num" />
                    <span className="num" />
                    <div className="bar-track" />
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div className="slip-stairs">
              <Stairs tiers={result.tiers} />
              {top && (
                <p className="small">
                  หน่วยสุดท้ายอยู่ขั้นที่ {currentTier(result.tiers) + 1} ({tierRange(top)}) หน่วยละ ฿
                  {Number(top.pricePerKwh).toFixed(4)} · แต่ละขั้นคิดเงินตามรายละเอียดด้านล่าง
                </p>
              )}
              <a
                className="learn-link"
                href={props.learnHref}
                onClick={(e) => {
                  if (!isPlainClick(e)) return
                  e.preventDefault()
                  props.onLearn()
                }}
              >
                ค่าไฟขั้นบันไดคิดยังไง →
              </a>
              {props.usage.some((u) => !u.line) && (
                <p className="small stairs-skipped">
                  ไม่ได้นำมาคิด: {props.usage.filter((u) => !u.line).map((u) => u.name).join(', ')}
                </p>
              )}
            </div>
          )}

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
