# Production deployment, monitoring and maintenance

## 1. What is deployed today

The repository is a static site (no build step) published with GitHub Pages from the `gh-pages` branch, which mirrors `main` (publish with `git push origin main:gh-pages`):

| Path | Purpose |
|---|---|
| `index.html` | Single-page dashboard shell |
| `assets/js/data.js` | Deterministic **synthetic** data layer (replace in production) |
| `assets/js/engine.js` | Filter context, aggregation, thresholds, formatting |
| `assets/js/kpis.js` | KPI catalog: 164 KPIs + 6 composites |
| `assets/js/charts.js` | SVG charts with tooltips and table views |
| `assets/js/xlsx.js` | Dependency-free Excel writer |
| `assets/js/app.js` | Pages, calculation drawer, drill-down, alerts, exports |
| `tests/formulas.test.js` | Formula, cost and calculation validation tests |
| `scripts/build-docs.js` | Regenerates the catalog, dictionary and dataset exports |
| `scripts/monthly-report.js` | Generates the monthly executive report |

Run locally: `python3 -m http.server 8080` in the repository root, then open `http://localhost:8080`.

## 2. Production deployment

1. **Host** the static front end behind the enterprise SSO (e.g. a static web app or object storage + CDN with an authenticating proxy), in a UAE region.
2. **Replace** `assets/js/data.js` with an API client that returns the same fact / record shapes from the KPI layer (`06-integrations.md`, API section). The engine and catalog stay unchanged.
3. **KPI layer**: PostgreSQL (or the chosen warehouse) with the schema in `05-database-schema.sql`, RLS enabled, in-country storage.
4. **Pipelines**: connectors and schedules in `07-ingestion-workflows.md`.
5. **Secrets** in a vault; connector identities are read-only workload identities.
6. **Environments**: dev → test (synthetic data + contract tests) → prod; promotion requires passing tests and a signed change record.

## 3. Continuous validation

- `node --test tests/formulas.test.js` runs on every change: catalog completeness (all 164 KPIs fully specified), formula identities, additivity across BUs and tenants, de-duplication, token normalisation, provider-specific pricing, threshold logic, composite weights, period comparison, filter applicability, determinism and the Excel writer.
- `node scripts/build-docs.js` regenerates documentation from the code; a diff in generated docs without a matching code change fails review.
- Browser smoke tests (Playwright) load every route, open KPI drawers and check for console errors and horizontal overflow at desktop and phone widths.

## 4. Monitoring the dashboard itself

| Signal | Threshold | Action |
|---|---|---|
| Source freshness | Beyond cadence SLA | Freshness badge, DQ alert to data owner |
| Source completeness | < 98% | Evidence quality lowered; owner ticket |
| Reconciliation variance | Gateway vs billing > 2% | Cost KPIs marked provisional |
| KPI build duration | > 2× trailing median | Platform alert |
| API error rate | > 1% over 15 min | On-call page |
| Front-end errors | Any uncaught exception | Logged with build ID |

## 5. Maintenance calendar

| Cadence | Activity | Owner |
|---|---|---|
| Monthly | Finance close load, board report, alert review | CFO office, CISO |
| Monthly | Model price list and quota commitments update | AI FinOps |
| Quarterly | Threshold and target review against strategy and risk appetite | CISO, domain owners |
| Quarterly | Access review (roles, scopes, break-glass) | IAM |
| Semi-annual | Re-validate manual time baselines per workflow | AI Operations, Internal Audit |
| Annual | Re-calibrate FAIR scenarios; review framework applicability | CRO, Legal / Compliance |
| On change | New KPI or formula change: update `kpis.js`, tests, regenerate docs, change record | Dashboard product owner |

## 6. Automated monthly reporting

`scripts/monthly-report.js` produces `reports/monthly-executive-report-YYYY-MM.md` and a CSV of all KPIs for a month (default: last closed month):

```bash
node scripts/monthly-report.js 2026-10
```

Example scheduler (GitHub Actions; adapt to your CI). Store it as `.github/workflows/monthly-report.yml` if you want the repository to produce the report automatically:

```yaml
name: monthly-executive-report
on:
  schedule:
    - cron: "17 5 6 * *"   # 6th of each month, 05:17 UTC (09:17 GST)
  workflow_dispatch: {}
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node --test tests/formulas.test.js
      - run: node scripts/monthly-report.js
      - run: |
          git config user.name "report-bot"
          git config user.email "report-bot@users.noreply.github.com"
          git add reports/
          git commit -m "Monthly executive report" || echo "no changes"
          git push
```

PDF output: open the dashboard with the month selected and use **PDF** (browser print to PDF, landscape A4, dark theme preserved), or render the Markdown report with your document tooling.

## 7. Runbook: a KPI looks wrong

1. Open the KPI drawer: check the inputs table, sources and freshness.
2. Check "Filters applied / not applicable" chips: a filter may not apply to that KPI's data.
3. Drill down by BU / tenant / agent to localise the anomaly.
4. Inspect the underlying records and export them (CSV).
5. Compare with the source system using the evidence references; raise a DQ ticket if the source is wrong, or a change if the formula is wrong.
