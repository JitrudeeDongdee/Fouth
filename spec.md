# Fouth — Electricity Billing System (spec)

Source of truth for scope, decisions and current state. Update after every task.

## Goal

**Now (decided 2026-11-02):** a public website that helps a household estimate its
monthly electricity bill. The user lists appliances (fridge, air conditioner, TV, …),
enters each one's spec and hours of use per day, and gets estimated kWh per month and
a bill priced with the real tiered rates, Ft and VAT. It runs entirely in the browser
on GitHub Pages, using the same Kotlin billing engine compiled to JavaScript.

**Later (not decided):** the utility back office — customers and meters per district,
smart-meter readings intake (~2,880 rows/meter/month), an idempotent monthly billing
run, payments/overdue, roles per district. The engine is shared, so this can be built
on top without changing the pricing rules.

## Stack

- Kotlin Multiplatform (JVM + JS), JDK 21, Gradle Kotlin DSL, Kotlin 2.0.21
- Decimals: `com.ionspin.kotlin:bignum` (works on JVM and JS); dates: `kotlinx-datetime`
- Tests: `kotlin.test` in `commonTest`, run on both JVM and Node.js (`allTests`)
- Web: React 18 + TypeScript + Vite in `web/`, Vitest; deployed to GitHub Pages
- CI/CD: GitHub Actions (`.github/workflows/ci.yml`)

## Versions

| Version | Scope | Status |
|---|---|---|
| v0.1 | Calculation engine (tiered, TOU, Ft, VAT) + unit tests | merged into `develop` (PR #1) |
| v0.2 | Engine on JVM + JS, appliance estimator, web page on GitHub Pages, CI/CD | on `feature/web-calculator`, not merged |
| later | Utility back office (readings, billing run, payments, roles) | not decided |

## v0.2 — appliance estimator (package `com.fouth.billing.estimate`)

- `Appliance` (sealed):
  - `RatedAppliance(name, watts, hoursPerDay, quantity)` — kWh/day = W × h ÷ 1000.
  - `AirConditioner(name, btuPerHour, eer, hoursPerDay, loadFactor = 0.7, quantity)` —
    W = BTU ÷ EER; kWh/day = W × loadFactor × h ÷ 1000.
  - `LabelledAppliance(name, kwhPerYear, quantity)` — kWh/day = kWh/year ÷ 365 (fridge, energy label).
- `UsageEstimator.estimate(appliances, daysPerMonth = 30)` → each appliance's kWh/month
  rounded to 2 decimals; the total is the sum of the rounded lines (so lines add up).
- `Utility` — `MEA` (กฟน., Bangkok / Nonthaburi / Samut Prakan) or `PEA` (กฟภ., the other
  74 provinces). Both charge the same baht per unit and the same service charge; what differs
  is the **type code** on the bill — MEA 1.1 / 1.2, PEA 1.1.1 / 1.1.2. The enum carries those
  codes, so a future divergence is a one-line change. `Utility.of("MEA")` throws on anything else.
- `HomeRates` — two schedules on one `EffectiveTimeline` per utility: `*-2023-01` (Jan 2023)
  and `*-2026-09`, the ERC progressive rate in force from the September 2026 bill. Ft is an input.
  `tariffCodeFor(utility, kWh)`: ≤ 150 → small-household code, otherwise large-household code.
- `HomeBillEstimator.estimate(appliances, utility, ftPerKwh, days, tariffCode?, on?)` → usage +
  `BillBreakdown`. `on` defaults to `HomeRates.CURRENT_SCHEDULE_FROM` (2026-09-01), so the
  current schedule is used unless a caller asks for an older date.
- JS boundary (`jsMain`, `com.fouth.billing.web`): `estimateBill(inputs, utility, ftPerKwh, days)`
  takes and returns **strings** for every number, so no value becomes a JS float. Errors come
  back in `EstimateResult.error` instead of throwing. `utilities()` hands the page each utility's
  code and its two type codes, so the page never hard-codes them.
- `EstimateResult.tiers: TierLine[]` — **every** tier of the tariff the bill was priced on,
  in order, including tiers the usage does not reach. Each `TierLine` has `fromKwh`,
  `toKwh` (`""` for the open-ended last tier), `pricePerKwh`, `kwh` used (`"0"` if not
  reached) and `amount`. `amount` is rounded per tier for display only; the bill rounds
  the energy total once. Built from `BillCalculator.tierUses`, so it always agrees with
  `energyLines`. `smallHouseholdLimitKwh()` (150) is also read by the page, not repeated.
- `estimateFromUsage(kWh, utility, ft)` → `EstimateResult` for a usage typed in as kWh
  (no appliances; `appliances` empty), on the same rules as `estimateBill`. Common code:
  `HomeBillEstimator.priceUsage`.
- `tariffSchedules(utility)` → `TariffSchedule(code, serviceCharge, tiers)` for the small-
  then large-household tariff in force now, every tier listed. Common code:
  `HomeRates.tariffsOn(utility, on)`. The learn page prints its rate tables from this.

### Compare mode (A/B), web only

The page keeps two appliance sets and prices both with the same utility, Ft and days,
so any difference between the two bills comes only from the appliances:

- Set A is the list that already existed; set B is created by copying A the first time
  compare mode is turned on (a list against an empty one says nothing). `copyRows` gives
  every copied row a fresh id, so the two sets never share a row or a React key.
- The mode is picked in the sidebar (see "App frame" below): บิลเดียว or เปรียบเทียบ 2 บิล.
  The top bar shows the current mode as a chip.
- The mode is in the URL: `?mode=single` or `?mode=compare`. The learn page adds
  `?page=learn`. A `view` parameter from older links (the removed tiers tab) is dropped.
  - On load, a valid `?mode=` wins over the mode saved in `localStorage`. A missing or
    unknown value falls back to the saved mode, and the URL is corrected with
    `replaceState`, keeping any other query parameters and the hash.
  - Changing the mode adds a history entry (`pushState`), so Back/Forward step between
    modes; `popstate` applies the mode from the URL.
  - Opening `?mode=compare` with no set B yet copies A into B, the same as choosing it
    from the menu.
  - The sidebar's mode items are real `<a href="?mode=…">` links, so they can be copied
    or opened in a new tab; a plain click is handled in the page without a reload.
  - Only the mode is in the URL. The appliance lists stay in each viewer's
    `localStorage`, so a shared link opens the right mode with the viewer's own
    appliances.
- One set is edited at a time (tabs), while the result prints **two separate slips**,
  one per set, each with its own total, tariff code, usage bars and bill table. The
  slip of the set being edited is marked "กำลังแก้ชุดนี้"; the other has "แก้ชุดนี้" to
  switch. Both slips share one bar scale, so equal bars mean equal kWh across bills.
  There is no separate summary card: the two slips are read side by side. Each slip
  carries the "คำนวณอย่างไร" notes; only the first has `id="how"`, which the sidebar's
  "วิธีคำนวณ" link targets.
- Compare mode widens the result column (`1fr / 1.3fr`); the printer is a CSS container
  and puts the slips side by side only from 560 px of its own width, stacked below that.
- Both sets, the mode and the Ft/days/utility choice are saved in `localStorage` under
  `fouth-estimator-v1`; set B is kept when the mode is switched off. A list saved before
  compare mode still loads, because set A kept the old `rows` key.

### Learn page: how the progressive rate works (web only)

- `?page=learn` opens a full-width explainer in place of the calculator. The calculator
  stays mounted behind it (`hidden`), so nothing typed is lost. `mode` and `view` stay in
  the URL, so "← กลับไปหน้าคำนวณ" (or Back) lands where the reader was.
- Ways in: the sidebar's "ความรู้ → ค่าไฟขั้นบันไดคิดยังไง" (a real link), and
  "ค่าไฟขั้นบันไดคิดยังไง →" under the staircase on a slip. The mode links in the sidebar
  leave the learn page.
- Sections, every figure from the engine:
  1. The idea, in four steps.
  2. The common misreading at 300 units: every unit at the last tier's price vs the
     correct sum.
  3. Which tariff applies (≤ 150 vs > 150), with both rate tables from
     `tariffSchedules`.
  4. "ลองคำนวณเอง": a kWh box with quick picks (the calculator's own usage, 50, 150, 151,
     300, 500), the same `TierPanel` as the tab, and the bill from energy charge to total.
  5. The 150 → 151 jump.
  6. The rest of the bill: service charge, Ft, VAT.
- The try box uses the calculator's utility and Ft.

### A broken card does not void the bill (web only)

- `estimateRows` (in `estimate.ts`) prices a set in three steps:
  1. The shared settings are checked with an empty list. If Ft, days or the utility is
     bad, that is still the whole bill's error, since no card could be priced.
  2. Each card is priced on its own. A card the engine rejects is set aside, with a Thai
     reason (`rowProblem`): first the empty fields its kind needs ("ยังไม่ได้กรอก:
     กำลังไฟ, ใช้วันละ"), else the engine's message mapped to Thai, else the engine's
     message without the card name.
  3. The bill is the cards that are left, and each card's kWh line is looked up by its id.
- A set-aside card has a red border. It shows "ไม่ได้นำมาคิด" when collapsed, and the
  reason plus "ยังไม่ได้นำการ์ดนี้มาคิดในบิล" when open.
- On the slip, the "ใช้ไฟจากอะไรบ้าง" list shows every card in list order. A card left out
  keeps its place with its name in red, an empty bar, and no units or baht; its reason
  is in the tooltip. The staircase view has no per-card list, so it shows one red line,
  "ไม่ได้นำมาคิด: <names>". Each set in compare mode reports its own.
- Opening or closing a card no longer reprints the slip: `collapsed` is left out of what
  the slip compares, since it is not on the paper.

### Slip usage toggle (web only)

- The usage section of each slip has a small toggle with two choices:
  - "ตามเครื่อง": the per-appliance kWh bars, titled "ใช้ไฟจากอะไรบ้าง".
  - "ขั้นบันได": the tier staircase, titled "ใช้ไฟถึงขั้นไหน", with one line naming
    the tier the last unit landed in and its price. The amounts per tier stay in the
    bill table below.
- Each slip has its own choice, so in compare mode set A can show the staircase while
  set B shows the bars. It is a per-viewer display preference in `localStorage`
  (`fouth-slip-usage-view`, saved as `{"a": …, "b": …}`), not bill data and not in the
  URL. A value saved before this was per slip (a bare `"tiers"` / `"appliances"`)
  applies to both. Toggling does not reprint the slip.
- The staircase is the same `Stairs` component the learn page uses, and has a link to it.

### Tier panel (learn page only)

- `TierPanel` prices one usage tier by tier. It shows why the tariff applies, the
  `Stairs` chart, a table of "kWh × price = amount" per tier with unreached tiers greyed,
  the energy charge, and the units left to the next tier and to the 150-unit switch.
  It is used by the learn page's "ลองคำนวณเอง" box.
- The calculator used to have a "บิล | ขั้นบันได" tab pair with `?view=bill|tiers`. It was
  removed once the slip got its own bars/staircase toggle: the slip carries the
  staircase, and the full explanation lives on the learn page.

### One card = one appliance (web only)

- A card in the appliance list is exactly one appliance; there is no quantity field.
  Five bulbs are five cards. The page always passes quantity `1` to the engine, which
  still accepts a quantity (unchanged, so other callers keep working).
- The หลอดไฟ LED preset is one 10 W bulb (it used to add 5).
- Lists saved while cards had a quantity are migrated on load by `splitByQuantity`: a
  card with quantity n becomes n cards with fresh ids, so the saved bill is unchanged.
  A missing, fractional or broken quantity counts as one. This runs after `resumeIds`,
  so the copies' ids never collide.

### Adding an appliance (web only)

- One "+ เพิ่มเครื่องใช้ไฟฟ้า" button sits under the list. In compare mode the picker says
  which set the appliance goes into ("ลงชุด A/B").
- The picker is `AppliancePicker`, a native `<dialog>` (focus trap, Esc, backdrop click),
  in two steps:
  1. **Categories**, a grid with line-art icons (`Icon.tsx`, inline SVG in
     `currentColor`; no emoji anywhere in the app). Each category shows how many models
     and brands it has. "อื่น ๆ" adds a blank card straight away.
  2. **The category's list**, which scrolls inside the dialog:
     - First, the no-brand default(s), marked "ค่าตั้งต้น". These are the original
       presets, e.g. แอร์ 12,000 BTU at EER 12.
     - Then brand chips to narrow the list, and the brand models. Each model shows its
       description, the spec it adds, and a "ที่มา" link to the manufacturer page
       (opens in a new tab).
- A search box sits on both steps (`matchesQuery`, `searchModels` in `catalog.ts`). It
  matches every word of the query, in any order and case, against category, brand, model
  code, description and spec figures; Thai digits count as Arabic ones.
  - On step 1 a search covers every category at once and replaces the grid with the
    results: matching categories' "ทั่วไป" defaults first, then models tagged with
    their category and icon.
  - On step 2 it narrows the list together with the brand chip.
  - An empty result says so and points back to the generic default.
- The title follows the choice: the category name, then "<category> · <brand>" once a
  brand chip is picked (e.g. "พัดลม · Hatari"). The search placeholder follows it too.
  The generic defaults hide while a brand is picked.
- Picking adds one card named "<category> <brand> <model>", closes the dialog, and
  scrolls the card into view. Reopening starts at the categories. Back or closing clears the search and the brand.
- On a phone the dialog is a bottom sheet with two category columns.
- Every card in the list shows its category's line icon, both collapsed and expanded.
  `Row.category` is stored when a card is added from the picker. Cards without it (the
  starter list, older saved lists) get one from `categoryOf`, in this order: air-con
  kind → แอร์; a name equal to or starting with a category's name; label kind → ตู้เย็น;
  anything else → อื่น ๆ (plug icon).

### Appliance catalog (web only)

- `catalog.ts` defines the categories (แอร์, ตู้เย็น, ทีวี, พัดลม, หลอดไฟ, เครื่องทำน้ำอุ่น,
  หม้อหุงข้าว, เครื่องซักผ้า, คอมพิวเตอร์, อื่น ๆ), each with its generic presets and models.
- `catalog-data.ts` holds the brand models. Each model's spec comes from the
  manufacturer's own page (`source`); hours of use and air-con load % stay the
  category's assumption, which the user edits.
- Data rules, applied by the merge script when the research was turned into
  `catalog-data.ts` and partly re-checked by `catalog.test.ts`:
  - The source is https on the brand's own domain. Carrier's spec PDFs are on
    shareddocs.com, which Carrier's Thai pages link to.
  - The figure is positive and plausible. Each model appears once.
  - Air-con EER = rated capacity ÷ rated input watts, the same basis for every brand.
    A printed EER is used only when there is no input figure.
  - A figure that is a maximum, or a washer total that includes its water heater, is
    left out, because at the category's hours of use it would overstate a month several
    times over. Apple computers (adapter/maximum power) are left out too, so
    คอมพิวเตอร์ has only its generic default.
  - Some figures come from the maker's site outside Thailand for the same model code
    (Sony TVs from Sony Singapore; Xiaomi fans and bulbs from mi.com outside /th). The
    card's description says so.
  - Philips Thailand gives only a barcode as the model, so the product name is shown and
    the barcode goes in the description.
- Contents as researched on 2026-11-18, 98 models in all:
  - แอร์: 37 (Carrier, Daikin, LG, Mitsubishi Electric, Panasonic, Samsung, Sharp)
  - ตู้เย็น: 13 (LG, Panasonic)
  - ทีวี: 10 (Sony, Xiaomi)
  - พัดลม: 12 (Hatari, Mitsubishi Electric, Xiaomi)
  - หลอดไฟ: 9 (Philips, Lamptan, Xiaomi)
  - เครื่องทำน้ำอุ่น: 9 (Stiebel Eltron, Mazuma)
  - หม้อหุงข้าว: 7 (Toshiba, Panasonic)
  - เครื่องซักผ้า: 1 (Toshiba top-load)
- Brands left out because their pages give no usable figure: Haier air-con (maximum
  only); Samsung/Hitachi/Toshiba/Sharp/Mitsubishi/Haier fridges (no kWh/year); LG/TCL/
  Hisense/Sharp TVs (no power row); Samsung TVs (maximum only); most washers (maximum
  including heater).
- Known gaps: no 1-door fridges and no 32" TVs in the set; only one washer.

### App frame: top bar + sidebar (web only)

- A sticky top bar (`--topbar-h`, 52 px) holds the ☰ menu button, the name, and the
  current bill mode.
- The sidebar is a navigation menu: section "รูปแบบบิล" (the two modes, with small slip
  pictures) and section "ไปที่" (เครื่องใช้ไฟฟ้า, ผลคำนวณ, วิธีคำนวณ; the last opens the
  notes `<details>` before scrolling). Targets carry `scroll-margin-top` so they land
  below the top bar.
- Above 860 px the sidebar sits in the page grid (236 px) and ☰ or "« ย่อเมนู" folds it
  to a 64 px icon rail. The folded state is a per-viewer convenience kept in its own
  `localStorage` key, `fouth-nav-collapsed`, apart from the bill data.
- At 860 px and below it is an overlay sliding in from the left over a backdrop. Esc, the
  backdrop or choosing an item closes it. When closed it is `inert`, so it cannot
  take focus while off screen, and focus returns to ☰ if it was inside the menu.
- This replaced the earlier mode drawer (a `<dialog>`), which only picked the mode.

### The result as a printed slip (web only)

The right-hand panel is drawn as a till slip fed out of a printer: a machine head with
a status light, a slot, and the paper below it.

- `.receipt` redefines `--ink`, `--muted`, `--line`, `--panel`, `--accent-soft` and
  `--bar` locally, so the bars, bill table and notes all pick up the
  paper palette without rules of their own.
- The torn bottom edge is a two-layer CSS mask (a conic-gradient tile repeated along the
  bottom). A mask clips a `box-shadow` away, so the paper's shade is a `filter:
  drop-shadow` instead.
- A change reprints a slip, but only `PRINT_DELAY_MS` (600 ms) after the last edit, so
  typing a number does not reprint per keystroke. Only the slip whose contents changed
  is reprinted: each set's contents are its rows plus utility, Ft and days, compared
  against what was last printed. Editing set A reprints only A's slip, editing B only
  B's, and changing a shared setting reprints both. Each slip keeps its own "พิมพ์เมื่อ"
  time. The figures themselves update live
  while typing; it is the paper that waits. The status light blinks during the wait.
- The feed uses `steps(16)` rather than a smooth curve, because paper leaves a printer a
  notch at a time, and `.paper-feed` clips it so it appears from the slot.
- The animation is restarted by removing the class, forcing a reflow and re-adding it,
  on the `.receipt[data-set=…]` of each changed set. Remounting with a `key` would also work but would
  close the notes section on every print. A mode change does remount (the slip count
  changes), and the reprint for that change is skipped so new slips feed only once.
  Switching which set is edited does not reprint: it is not on the paper.
- `prefers-reduced-motion: reduce` turns off both the feed and the blinking light.

### Estimator assumptions (shown to the user on the page)

- Air conditioner load factor 70% by default (the compressor cycles); user-editable.
- The small- vs large-household tariff is chosen from this month's estimate; the utility
  uses usage history.
- The page defaults to PEA, because it covers 74 of 77 provinces; the user picks the other.
- Division (BTU ÷ EER, kWh/year ÷ 365) uses 10 decimal places, half-up, before the
  2-decimal kWh rounding.

## v0.1 — calculation engine (package `com.fouth.billing.engine`)

Pure Kotlin (common code), no Spring, no database.

### Data contracts

- `Effective<T>(id, from, until?, value)` — `from` inclusive, `until` exclusive, `null` = open-ended.
- `EffectiveTimeline<T>` — rejects overlaps and duplicate ids at construction; a lookup
  that falls in a gap throws `NoRateException`.
- `RateBook(tariffs, ft, vat)` — three independent timelines, because base tariffs change
  rarely, Ft every 4 months, VAT rarely. `resolve(tariffCode, date)` → `ResolvedRates`
  carrying the id of each version used (this is what a bill stores for audit).
- `Tariff` = `TieredTariff(code, tiers, serviceCharge)` | `TouTariff(code, peak, offPeak, serviceCharge)`.
  `Tier.upToKwh` is the cumulative upper bound (inclusive); the last tier has `null`.
- `Usage` = `Usage.Total(kwh)` for tiered tariffs | `Usage.TimeOfUse(peakKwh, offPeakKwh)` for TOU.
  A mismatch is an error, not a silent conversion.
- `BillCalculator.calculate(usage, rates)` → `BillBreakdown` (energy lines, energy, service,
  Ft, subtotal, VAT, total, plus the `ResolvedRates` it used).
- `BillCalculator.tierUses(tariff, kWh)` → `TierUse(fromKwh, toKwh?, pricePerKwh, kwh)` for
  every tier, filling each from the bottom; untouched tiers have kwh 0. The bill's energy
  lines are exactly the tier uses with kwh > 0 (tested at the tier boundaries).
- `TouClassifier(holidays)` — classifies a 15-minute interval by its **start** time.

### Rounding rules (decided)

- All money: 2 decimals, half-up (`ROUND_HALF_AWAY_FROM_ZERO`, same as Java `HALF_UP`), in one place (`Money`).
- Tier/TOU line amounts are kept exact; rounding happens **once per bill component**
  (energy, Ft, VAT), not per tier line, so tier rounding cannot drift.
- Ft charge = total kWh × Ft rate, rounded. Ft may be negative.
- Subtotal = energy + service charge + Ft. VAT = subtotal × VAT rate, rounded. Total = subtotal + VAT.
- Decimals are only ever built from strings (`decimal("8.19")`), never from `Double`.

### Assumptions (stated, not verified with a real utility)

- Ft and VAT are picked by the bill's **meter-read date**; a billing period that crosses
  an Ft change is not prorated.
- TOU peak = Mon–Fri 09:00–22:00; off-peak = 22:00–09:00, weekends, and listed public
  holidays. Hours are constructor parameters.
- The tariff code is an input. PEA's "reclassify 1.1.1 → 1.1.2 after 3 months over 150 kWh"
  rule, the free-electricity scheme (≤ 50 kWh) and the +2% transformer loss are out of scope.

### Test fixtures

Engine fixtures for 1.1.1, 1.1.2 and 1.2.2 come from PEA's published schedule
(EN_Electricity_Tariffs_Jan_2023.pdf, unofficial translation). Ft values in tests are
**illustrative**, not official.

### Rate sources (checked 2026-11-07)

| What | Value | Source |
|---|---|---|
| Residential tiers from the Sep 2026 bill | 0–15 2.3488, 16–25 2.9882, 26–200 3.0000, 201–400 4.1584, 401+ 4.3583 | PEA announcement, 19 Aug 2026 (`Electricity_Tariff_SEP_2026_3.pdf`), ERC resolution of 5 Aug 2026 |
| Large-household tiers | 0–200 3.0000, 201–400 4.1584, 401+ 4.3583 | same announcement |
| Service charge | 8.19 (small) / 24.62 (large) | mea.or.th, "ประเภทที่ 1 บ้านอยู่อาศัย" — unchanged by the Sep 2026 revision |
| MEA type codes 1.1 / 1.2 vs PEA 1.1.1 / 1.1.2 | — | mea.or.th tariff page; PEA announcement |
| Default Ft, Sep–Dec 2026 | 0.1623 บาท/หน่วย (16.23 สตางค์) | PEA, `Ft surcharge SEP-DEC 2026_Final.pdf` |

MEA's and PEA's residential rates were the same number for number on both schedules, so the
utility changes the type code shown, not the amount. An engine test asserts this, so a future
divergence fails loudly instead of passing silently.

## Current state

- Repo: https://github.com/JitrudeeDongdee/Fouth (public). Branches: `main`, `develop`.
- Git Flow: feature branches off `develop`, PR into `develop`; a human merges.
- `feature/web-calculator` (v0.2): 31 engine tests pass on JVM and on Node.js
  (`./gradlew :billing-engine:allTests`), 3 web tests pass (`cd web && npm test`),
  `npm run build` succeeds; page checked at desktop and 375 px widths.
- `feature/collapsible-appliances`: collapsible rows, the MEA/PEA picker with the
  September 2026 tariff, and the A/B compare mode. Engine tests pass on JVM and Node.js;
  12 web tests pass; `npm run build` succeeds; both utilities, the compare mode and the
  printed-slip UI checked in the browser at desktop and 375 px. PR #4 merged into
  `develop`; the printed slip (406ffce) is PR #5 into `develop`, open.
- `feature/bill-mode-drawer` (branched from `feature/collapsible-appliances`, so it
  carries 406ffce until PR #5 merges): two separate slips in compare mode, then the
  mode drawer replaced by a top bar + collapsible sidebar menu. PR #6 into `develop`.
  12 web tests pass, `npm run build` succeeds; checked in the browser at 1280 px (slips
  side by side, ฿780.09 vs ฿162.83 with the air conditioner removed from B, "ชุด B
  ถูกกว่า ฿617.26 ต่อเดือน · ฿7,407.12 ต่อปี") and 375 px (slips stacked, drawer as a
  bottom sheet, no horizontal overflow). Sidebar checked at 1280 px (rail fold kept
  after reload, "วิธีคำนวณ" opens the notes) and 375 px (overlay opens with focus on the
  first item; Esc, backdrop and picking a mode close it; `inert` when closed).
  `?mode=` checked in the browser: load without it adds it without a new history entry;
  a menu click pushes one; Back and Forward switch the mode; opening `?mode=compare`
  over a saved single mode with no set B copies A (fresh ids); `?mode=foo&x=1#how`
  falls back to the saved mode and keeps `x=1` and `#how`.
  Add-appliance modal checked at 1280 px (centred, 11 presets, picking พัดลม in compare
  mode added it to set A and closed the modal) and 375 px (bottom sheet, two columns,
  scrolls). Tiers tab: engine `allTests` 38 passed on JVM and on Node.js (3 new tier
  tests); 13 web tests; checked in the browser at 1280 px (48.66 kWh on 1.1.1: 35.23 +
  29.88 + 70.98 = 136.09, matching the bill; tiers 4 and 5 shown unreached; compare
  shows two panels) and 375 px (panels stacked, no overflow).
  `?view=` checked in the browser: load adds `view=bill`; the sidebar link and the tab
  push one entry each; switching mode keeps the view; Back ×3 and Forward step through
  every page; `?view=tiers` opens the table directly; "วิธีคำนวณ" from the table
  switches to the bill and opens the notes; `view=nope&x=1#a` falls back to the bill
  and keeps `x=1#a`.
  Learn page: engine `allTests` 41 passed on JVM and Node.js (3 new); 15 web tests.
  Checked in the browser at 1280 px: 300 units reads ฿1,247.52 (wrong) vs ฿1,015.84
  (right); both rate tables are correct; 150 → 151 units goes ฿505.74 → ฿537.28 (+31.54);
  "บ้านของฉัน" 48.66 units gives ฿162.83, matching the bill; Back returns to the
  calculator. At 375 px there is no overflow.
  Slip usage toggle: checked in the browser. Switching to ขั้นบันได draws 5 steps with
  "ขั้นที่ 3 (25–200) หน่วยละ ฿3.0000" for 48.66 units, and the choice is stored. In
  compare mode both slips follow one toggle and nothing reprints.
  Tiers tab removed: checked in the browser. Opening `?mode=single&view=tiers` shows the
  bill and the URL becomes `?mode=single`; there are no result tabs; the sidebar has no
  "หน้า" section and "ไปที่ → ผลคำนวณ" scrolls to the slip; the slip's staircase link opens
  `?page=learn` and Back returns. 15 web tests pass and the build succeeds.
  One card = one appliance: 17 web tests (2 new for the migration). In the browser a
  saved "หลอดไฟ LED × 5" became 5 cards in both sets (ids unique, no `quantity` left) and
  the total stayed ฿162.83 at 48.66 units. No "จำนวน" field remains.
  Appliance picker and catalog: 21 web tests (4 for the catalog). Checked in the browser:
  10 categories with icons and model counts, no emoji left; ตู้เย็น → Panasonic narrows
  to 6; picking NR-BX421BPST adds "ตู้เย็น Panasonic NR-BX421BPST" at 385.44 kWh/ปี;
  "ที่มา" opens the maker page in a new tab; reopening starts at the categories. At
  375 px it is a bottom sheet whose list scrolls, with no overflow.
  Card icons: 23 web tests (2 new for `categoryOf`). In the browser all 7 cards on the
  page show an icon, including cards saved before categories existed.
  Picker search: 25 web tests (2 new). In the browser:
  - "16 นิ้ว" across categories finds 8 fans; "daikin 12" finds 2 Daikin units; "พัดลม"
    shows the fan default and 12 fans.
  - Inside พัดลม, picking Hatari titles it "พัดลม · Hatari" with 6 models, and "18" then
    leaves P18R1.
  - Empty results show a message, and back clears the title and the search.
  Per-slip toggle (PR #7 is merged and live at 511f577; this is a new branch,
  `feature/slip-toggle-per-set`): 25 web tests pass and the build succeeds. In compare
  mode, switching B to ขั้นบันได leaves A on bars and the reverse; the stored value is
  `{"a":"tiers","b":"appliances"}`; the old `"tiers"` value loads as both.
  Partial pricing: 28 web tests (3 new). In the browser, set A with a fridge card
  missing its watts and hours shows ฿1,823.13 from the other 6 cards. The fridge card
  is red ("ไม่ได้นำมาคิด" / "ยังไม่ได้กรอก: กำลังไฟ, ใช้วันละ"), and slip A says
  "ไม่ได้นำมาคิด 1 รายการ … ตู้เย็น 2 ประตู". Set B is unaffected at ฿162.83. Opening and
  closing a card leaves the printer light idle.
  Inline skipped card (PR #8 merged and live at dc5cfb3; new branch
  `feature/slip-skipped-inline`): 28 web tests pass and the build succeeds. On slip A
  the fridge is listed first in red with no bar, units or baht, and the 6 priced cards
  keep their figures; the dashed box is gone; the staircase view shows "ไม่ได้นำมาคิด:
  ตู้เย็น 2 ประตู".

### CI/CD (`.github/workflows/ci.yml`)

| Job | Runs on | Does |
|---|---|---|
| `engine` | every push / PR | `allTests` (JVM + JS), builds the JS library, uploads it as an artifact |
| `web` | every push / PR | `npm ci`, `npm test`, `npm run build`, writes `dist/version.json` |
| `deploy` | push to `develop` only | deploys `web/dist` to GitHub Pages, then checks the live `version.json` shows this commit |

- `version.json` = `{version, sha, built_at}`; version is the latest `v*` tag (or `0.0.0`) + `-dev.<run>`.
- On a failed deploy, `.github/scripts/log-deploy-failure.sh` opens a ticket in the phak
  "Deploy Fail Log" project if the `PHAK_TOKEN` repository secret is set; otherwise it prints
  "skipped". It always exits 0, so it cannot change the deploy result.
- Pages must be enabled once with source "GitHub Actions" (repo Settings → Pages).

## Next step

PRs #5, #6 and #7 are merged and live; GitHub Pages serves `develop` at 511f577. PR #8 is merged and live at dc5cfb3. Next, a human reviews and merges the PR for
`feature/slip-skipped-inline` → `develop`, and the merge deploys it.
