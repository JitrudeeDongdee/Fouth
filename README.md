# Fouth

A home electricity bill estimator: list your appliances (fridge, air conditioner, TV, …),
enter each one's spec and hours of use per day, and see the estimated kWh per month and
the bill priced with Thailand's tiered residential rates, Ft and VAT 7%.

The pricing rules are a Kotlin Multiplatform library (`billing-engine`) that runs on the
JVM and is compiled to JavaScript for the web page, so the browser uses exactly the code
the tests check. Every amount is an exact decimal built from text, never a float.

Scope, decisions and current status: [spec.md](spec.md).

## Run it

Requires JDK 21 and Node.js 22.

```bash
./gradlew :billing-engine:allTests                          # engine tests on JVM and Node.js
./gradlew :billing-engine:jsNodeProductionLibraryDistribution  # build the engine for the web page
cd web && npm install && npm run dev                        # http://localhost:5173
```

`cd web && npm test` checks the page talks to the compiled engine correctly.

## Layout

- `billing-engine/src/commonMain` — pricing (`engine`) and appliance estimates (`estimate`)
- `billing-engine/src/jsMain` — the boundary the web page calls (`estimateBill`)
- `web/` — React + TypeScript + Vite page
- `.github/workflows/ci.yml` — tests on every push/PR; a push to `develop` deploys to GitHub Pages
