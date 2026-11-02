# Fouth — Electricity Billing System (spec)

Source of truth for scope, decisions and current state. Update after every task.

## Goal

A portfolio-grade utility billing system for an electricity distributor: customers and
meters split by district office, meter readings intake, effective-dated rate tables,
an idempotent and resumable monthly billing run, payments and overdue/disconnection flow,
and role-based access scoped per district.

The selling point is data volume: one smart meter sends a reading every 15 minutes
(~2,880 rows/month). 100,000 meters ≈ 288 million rows/month, so the design needs
monthly partitions, summary tables and batch processing.

## Stack

- Kotlin + Spring Boot 3 (JDK 21), Gradle Kotlin DSL, multi-module
- PostgreSQL + Flyway (from v0.2)
- JUnit 5, Testcontainers (from v0.2)
- React + TypeScript + Vite frontend, GitHub Pages demo with a simulated API (v0.3–v0.4)
- CI: GitHub Actions

## Planned features

- Customers and meters split by district office (each user sees only their district).
- Readings: smart meters every 15 min, manual meters monthly. Missing readings are
  estimated, then corrected in the next cycle.
- Rate tables with effective dates: tiered, TOU, service charge, Ft (changes every
  4 months), VAT 7%. All money in `BigDecimal` with explicit rounding rules.
- Monthly billing run (batch): idempotent (no double billing on re-run), resumable,
  every bill records the rate set and readings it used.
- Payments and overdue: overdue bill → notice → status "awaiting disconnection".
- Roles: admin / billing officer / meter reader / customer; district check on every request.

## Versions

| Version | Scope | Status |
|---|---|---|
| v0.1 | Calculation engine (tiered, TOU, Ft, VAT) + full unit tests | done on `feature/v0.1-rate-engine`, PR into `develop` awaiting review |
| v0.2 | Readings intake + billing run + PostgreSQL | not started |
| v0.3 | Web pages + roles + payments/overdue | not started |
| v0.4 | `ARCHITECTURE.md` (BPMN, ER, AWS scale-out) + PDF + demo site | not started |

## v0.1 — calculation engine (module `billing-engine`)

Pure Kotlin, no Spring, no database. Package `com.fouth.billing.engine`.

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

- All money: scale 2, `RoundingMode.HALF_UP`, in one place (`Money`).
- Tier/TOU line amounts are kept exact; rounding happens **once per bill component**
  (energy, Ft, VAT), not per tier line, so tier rounding cannot drift.
- Ft charge = total kWh × Ft rate, rounded. Ft may be negative.
- Subtotal = energy + service charge + Ft. VAT = subtotal × VAT rate, rounded. Total = subtotal + VAT.
- `BigDecimal` is only ever built from strings, never from `Double`.

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
- v0.1 done on `feature/v0.1-rate-engine`: 30 unit tests pass locally (`./gradlew test`, JDK 21,
  Gradle 8.10.2 wrapper, Kotlin 2.0.21). CI: `.github/workflows/ci.yml` runs the same on push/PR.

## Next step

Human reviews and merges the v0.1 PR into `develop`. Then v0.2: readings schema
with monthly partitions, Flyway, Testcontainers, billing run.
