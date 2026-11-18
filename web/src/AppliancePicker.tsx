import { useState, type RefObject } from 'react'
import { specSummary, type Preset } from './appliances'
import {
  brandsOf,
  CATEGORIES,
  genericPreset,
  matchesQuery,
  presetFromModel,
  searchModels,
  searchText,
  type CatalogModel,
  type Category,
  type CategoryId,
} from './catalog'
import { Icon } from './Icon'

/** What a preset will add, in the same words a collapsed row uses. A blank preset is filled in by hand. */
const presetSummary = (preset: Preset) =>
  preset.kind === 'rated' && preset.watts.trim() === '' ? 'กรอกสเปคเอง' : specSummary({ ...preset, id: 0, collapsed: false })

/**
 * The add-appliance picker, in two steps inside one native <dialog>:
 *   1. a grid of categories, each with a line icon;
 *   2. that category's list: the no-brand default first, then the brand models, which
 *      scroll and can be narrowed to one brand.
 * A search box sits on both steps. On the first it searches every category at once and
 * replaces the grid with the results; on the second it narrows that category's list.
 * "อื่น ๆ" has nothing to choose between, so it adds its blank card straight away. Every
 * other category opens its list, even before it has models, so the steps never change.
 */
export function AppliancePicker(props: {
  dialog: RefObject<HTMLDialogElement>
  /** "ลงชุด A" in compare mode, so it is clear which set the appliance goes into. */
  target: string | null
  onPick: (preset: Preset) => void
}) {
  const [categoryId, setCategoryId] = useState<CategoryId | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const category = CATEGORIES.find((c) => c.id === categoryId) ?? null
  const searching = query.trim() !== ''

  const close = () => props.dialog.current?.close()
  const open = (c: Category) => {
    if (c.id === 'other') {
      props.onPick(genericPreset(c))
      return
    }
    setCategoryId(c.id)
    setBrand(null)
    setQuery('')
  }
  const back = () => {
    setCategoryId(null)
    setBrand(null)
    setQuery('')
  }

  // Step 2: the brand chip and the search box narrow the list together.
  const shown = category
    ? category.models.filter((m) => (brand === null || m.brand === brand) && matchesQuery(searchText(category, m), query))
    : []
  const genericShown = category ? category.generic.filter((g) => !searching || matchesQuery(`${category.name} ${g.name}`, query)) : []
  // Step 1: a search across every category, generic defaults included by category name.
  const found = !category ? searchModels(query) : []
  const genericFound = !category && searching ? CATEGORIES.filter((c) => matchesQuery(`${c.name} ${c.generic[0].name}`, query)) : []

  const title = category ? (brand ? `${category.name} · ${brand}` : category.name) : 'เพิ่มเครื่องใช้ไฟฟ้า'

  return (
    <dialog
      className="modal"
      ref={props.dialog}
      aria-labelledby="picker-title"
      // Every opening starts at the categories with an empty search.
      onClose={back}
      // A click that lands on the <dialog> itself, not its content, is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal-body">
        <div className="modal-head">
          {category && (
            <button className="icon-btn picker-back" onClick={back} aria-label="กลับไปเลือกประเภท">
              ‹
            </button>
          )}
          <h2 id="picker-title">
            {title}
            {props.target && <span className="muted small"> · {props.target}</span>}
          </h2>
          <button className="icon-btn" onClick={close} aria-label="ปิด">
            ✕
          </button>
        </div>

        <label className="picker-search">
          <span className="visually-hidden">ค้นหา</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              category
                ? `ค้นหา${brand ? ` ${brand}` : category.name} เช่น รุ่น ขนาด`
                : 'ค้นหาประเภท ยี่ห้อ หรือรุ่น เช่น Daikin, 16 นิ้ว'
            }
          />
          {searching && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="ล้างคำค้นหา">
              ✕
            </button>
          )}
        </label>

        {!category ? (
          searching ? (
            <div className="picker-list" aria-live="polite">
              {genericFound.length > 0 && (
                <ul className="model-list" aria-label="ค่าทั่วไป">
                  {genericFound.map((c) => (
                    <li key={c.id}>
                      <GenericButton category={c} index={0} onPick={props.onPick} />
                    </li>
                  ))}
                </ul>
              )}
              {found.length > 0 && (
                <ul className="model-list" aria-label="รุ่นที่ค้นพบ">
                  {found.map(({ category: c, model: m }) => (
                    <ModelItem key={`${c.id} ${m.brand} ${m.model}`} category={c} model={m} onPick={props.onPick} withCategory />
                  ))}
                </ul>
              )}
              {genericFound.length === 0 && found.length === 0 && (
                <p className="picker-empty">ไม่พบ "{query.trim()}" · ลองคำอื่น หรือเลือกประเภทแล้วใช้ค่าทั่วไป</p>
              )}
            </div>
          ) : (
            <>
              <ul className="category-grid">
                {CATEGORIES.map((c) => (
                  <li key={c.id}>
                    <button className="category" onClick={() => open(c)}>
                      <Icon name={c.icon} size={32} />
                      <span className="category-name">{c.name}</span>
                      <span className="category-count">
                        {c.models.length > 0
                          ? `${c.models.length} รุ่น · ${brandsOf(c).length} ยี่ห้อ`
                          : c.id === 'other'
                            ? 'กรอกสเปคเอง'
                            : 'ค่าทั่วไป'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">เลือกประเภท แล้วเลือกยี่ห้อ/รุ่น หรือใช้ค่าทั่วไปถ้าไม่รู้รุ่น</p>
            </>
          )
        ) : (
          <div className="picker-list" aria-live="polite">
            {genericShown.length > 0 && brand === null && (
              <ul className="model-list" aria-label="ค่าทั่วไป">
                {genericShown.map((g) => (
                  <li key={g.name}>
                    <GenericButton category={category} index={category.generic.indexOf(g)} onPick={props.onPick} />
                  </li>
                ))}
              </ul>
            )}

            {category.models.length > 0 && (
              <>
                <div className="brand-row" role="group" aria-label="กรองตามยี่ห้อ">
                  <button className={brand === null ? 'quick on' : 'quick'} aria-pressed={brand === null} onClick={() => setBrand(null)}>
                    ทุกยี่ห้อ
                  </button>
                  {brandsOf(category).map((b) => (
                    <button key={b} className={brand === b ? 'quick on' : 'quick'} aria-pressed={brand === b} onClick={() => setBrand(b)}>
                      {b}
                    </button>
                  ))}
                </div>

                <ul className="model-list" aria-label={`รุ่นของ${title}`}>
                  {shown.map((m) => (
                    <ModelItem key={`${m.brand} ${m.model}`} category={category} model={m} onPick={props.onPick} />
                  ))}
                </ul>
                {shown.length === 0 && (
                  <p className="picker-empty">
                    ไม่พบรุ่นที่ตรงกับ "{query.trim()}"{brand ? ` ใน ${brand}` : ''} · ใช้ค่าทั่วไปของ{category.name}ได้
                  </p>
                )}
              </>
            )}

            <p className="hint">
              สเปคของแต่ละรุ่นมาจากหน้าเว็บผู้ผลิต (กด "ที่มา") ชั่วโมงใช้งานต่อวันเป็นค่าทั่วไป แก้ได้หลังเพิ่ม
            </p>
          </div>
        )}
      </div>
    </dialog>
  )
}

/** A category's no-brand default; the first one is marked as the default. */
function GenericButton(props: { category: Category; index: number; onPick: (preset: Preset) => void }) {
  const g = props.category.generic[props.index]
  return (
    <button className="model generic" onClick={() => props.onPick(genericPreset(props.category, props.index))}>
      <Icon name={props.category.icon} size={28} />
      <span className="model-text">
        <span className="model-name">
          {g.name}
          {props.index === 0 && <span className="badge">ค่าตั้งต้น</span>}
        </span>
        <span className="model-spec">ไม่ระบุยี่ห้อ · {presetSummary(g)}</span>
      </span>
    </button>
  )
}

/** One brand model with its spec and a link to the maker's page. */
function ModelItem(props: { category: Category; model: CatalogModel; onPick: (preset: Preset) => void; withCategory?: boolean }) {
  const { category: c, model: m } = props
  const preset = presetFromModel(c, m)
  return (
    <li className="model-item">
      <button className="model" onClick={() => props.onPick(preset)}>
        {props.withCategory && <Icon name={c.icon} size={24} className="model-icon" />}
        <span className="model-text">
          <span className="model-name">
            {props.withCategory && <span className="model-cat">{c.name} · </span>}
            <strong>{m.brand}</strong> {m.model}
          </span>
          <span className="model-desc">{m.description}</span>
          <span className="model-spec">{presetSummary(preset)}</span>
        </span>
      </button>
      <a className="model-source" href={m.source} target="_blank" rel="noopener noreferrer" title={m.figure}>
        ที่มา
      </a>
    </li>
  )
}
