import { useState, type RefObject } from 'react'
import { specSummary, type Preset } from './appliances'
import { brandsOf, CATEGORIES, presetFromModel, type Category, type CategoryId } from './catalog'
import { Icon } from './Icon'

/** What a preset will add, in the same words a collapsed row uses. A blank preset is filled in by hand. */
const presetSummary = (preset: Preset) =>
  preset.kind === 'rated' && preset.watts.trim() === '' ? 'กรอกสเปคเอง' : specSummary({ ...preset, id: 0, collapsed: false })

/**
 * The add-appliance picker, in two steps inside one native <dialog>:
 *   1. a grid of categories, each with a line icon;
 *   2. that category's list: the no-brand default first, then the brand models, which
 *      scroll and can be narrowed to one brand.
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
  const category = CATEGORIES.find((c) => c.id === categoryId) ?? null

  const close = () => props.dialog.current?.close()
  const open = (c: Category) => {
    if (c.id === 'other') {
      props.onPick(c.generic[0])
      return
    }
    setCategoryId(c.id)
    setBrand(null)
  }
  const back = () => {
    setCategoryId(null)
    setBrand(null)
  }

  const shown = category ? category.models.filter((m) => brand === null || m.brand === brand) : []

  return (
    <dialog
      className="modal"
      ref={props.dialog}
      aria-labelledby="picker-title"
      // Every opening starts at the categories.
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
            {category ? category.name : 'เพิ่มเครื่องใช้ไฟฟ้า'}
            {props.target && <span className="muted small"> · {props.target}</span>}
          </h2>
          <button className="icon-btn" onClick={close} aria-label="ปิด">
            ✕
          </button>
        </div>

        {!category ? (
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
        ) : (
          <div className="picker-list">
            <ul className="model-list" aria-label="ค่าทั่วไป">
              {category.generic.map((g, i) => (
                <li key={g.name}>
                  <button className="model generic" onClick={() => props.onPick(g)}>
                    <Icon name={category.icon} size={28} />
                    <span className="model-text">
                      <span className="model-name">
                        {g.name}
                        {i === 0 && <span className="badge">ค่าตั้งต้น</span>}
                      </span>
                      <span className="model-spec">ไม่ระบุยี่ห้อ · {presetSummary(g)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {category.models.length > 0 && (
              <>
                <div className="brand-row" role="group" aria-label="กรองตามยี่ห้อ">
                  <button className={brand === null ? 'quick on' : 'quick'} onClick={() => setBrand(null)}>
                    ทุกยี่ห้อ
                  </button>
                  {brandsOf(category).map((b) => (
                    <button key={b} className={brand === b ? 'quick on' : 'quick'} onClick={() => setBrand(b)}>
                      {b}
                    </button>
                  ))}
                </div>

                <ul className="model-list" aria-label={`รุ่นของ${category.name}`}>
                  {shown.map((m) => {
                    const preset = presetFromModel(category, m)
                    return (
                      <li key={`${m.brand} ${m.model}`} className="model-item">
                        <button className="model" onClick={() => props.onPick(preset)}>
                          <span className="model-text">
                            <span className="model-name">
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
                  })}
                </ul>
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
