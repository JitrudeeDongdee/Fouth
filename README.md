# Fouth

Electricity billing system (portfolio project): customers and meters per district office,
smart-meter readings every 15 minutes, effective-dated rate tables (tiered, TOU, Ft, VAT),
and an idempotent, resumable monthly billing run.

Scope, decisions and current status: [spec.md](spec.md).

## v0.1 — calculation engine

The `billing-engine` module is pure Kotlin: it prices one month of usage against rate
tables, using `BigDecimal` and explicit rounding rules (see spec.md).

```bash
./gradlew test
```

Requires JDK 21.
