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
- `HomeRates` — PEA residential 1.1.1 / 1.1.2 (Jan 2023); Ft is an input.
  `tariffCodeFor(kWh)`: ≤ 150 → 1.1.1, otherwise 1.1.2.
- `HomeBillEstimator.estimate(appliances, ftPerKwh, days)` → usage + `BillBreakdown`.
- JS boundary (`jsMain`, `com.fouth.billing.web`): `estimateBill(inputs, ftPerKwh, days)`
  takes and returns **strings** for every number, so no value becomes a JS float. Errors come
  back in `EstimateResult.error` instead of throwing.

### Estimator assumptions (shown to the user on the page)

- Air conditioner load factor 70% by default (the compressor cycles); user-editable.
- 1.1.1 vs 1.1.2 is chosen from this month's estimate; the utility uses usage history.
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

Tariff rates 1.1.1, 1.1.2 and 1.2.2 come from PEA's published schedule
(EN_Electricity_Tariffs_Jan_2023.pdf, unofficial translation). Ft values in tests are
**illustrative**, not official.

## Current state

- Repo: https://github.com/JitrudeeDongdee/Fouth (public). Branches: `main`, `develop`.
- Git Flow: feature branches off `develop`, PR into `develop`; a human merges.
- `feature/web-calculator` (v0.2): 31 engine tests pass on JVM and on Node.js
  (`./gradlew :billing-engine:allTests`), 3 web tests pass (`cd web && npm test`),
  `npm run build` succeeds; page checked at desktop and 375 px widths.

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

Human reviews the `feature/web-calculator` PR and merges it into `develop`; the merge
deploys the estimator to GitHub Pages.
