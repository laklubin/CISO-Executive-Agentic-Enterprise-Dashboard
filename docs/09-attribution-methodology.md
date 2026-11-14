# Risk and financial attribution methodology

## 1. Four kinds of value, never summed

| Value type | KPI | Basis | Evidence | Cash? |
|---|---|---|---|---|
| Realised cost savings | 1 | Finance-approved, dated cost reductions | GL posting, contract change, approval ID | Yes |
| Confirmed loss prevented | 2 (11 subset) | Finance / Risk-validated prevented loss per mitigated incident, counted once | Incident record, loss worksheet, validation ID | Avoided cash loss |
| Estimated loss avoidance | 3 | FAIR: baseline ALE − residual ALE, annualised | Scenario models, control effectiveness | No (risk estimate) |
| Productivity capacity | 6 | Hours saved × fully loaded BU rate | Trace cohorts, baseline studies, HR rates | No (capacity) |

The cash-basis Net Realized Financial Benefit (KPI 5) uses only the first two minus the incremental programme cost (KPI 7). ROI (KPI 8) and payback (KPI 16) follow from KPI 5.

## 2. Preventing double counting across controls and incidents

1. Each mitigated incident gets **one** Finance / Risk-validated prevented-loss value.
2. Every contributing control (EDR, SOC, SOAR, DLP …) may submit a claim; these **gross claims overlap**.
3. Attribution weights per incident: the primary control 50%, the remaining 50% split equally across other contributors. Weights always sum to 100%.
4. Attributed value = prevented loss × weight, rounded to whole AED with the rounding remainder on the primary control, so the attributed values sum **exactly** to the incident value.
5. KPI 2 = Σ attributed values = Σ prevented loss per incident. KPI 17 (value by control) reconciles to KPI 1 + KPI 2. Both identities are enforced by the automated tests.

### Worked example (from the synthetic dataset)

Incident `INC-202603-RB05`: Malware, High severity, Retail Bank. Potential loss AED 3,009,589; Finance-validated prevented loss **AED 2,413,804**.

| Control | Gross claim | Weight | Attributed |
|---|---|---|---|
| EDR/XDR (primary) | AED 2,413,804 | 50.0% | AED 1,206,901 |
| SOC | AED 2,413,804 | 16.7% | AED 402,301 |
| SOAR | AED 2,413,804 | 16.7% | AED 402,301 |
| DFIR | AED 2,413,804 | 16.7% | AED 402,301 |
| **Total** | AED 9,655,216 (gross, overlapping) | 100% | **AED 2,413,804 (counted once)** |

Counting gross claims would have overstated this one incident by AED 7.2M.

## 3. Estimated cyber loss avoidance (FAIR)

- For each risk scenario × tenant: `ALE = LEF × LM` (loss event frequency per year × loss magnitude in AED).
- Baseline uses inherent frequency and magnitude; residual applies current control effectiveness.
- KPI 3 = Σ baseline ALE − Σ residual ALE at period end (annualised, not summed over months). KPI 4 = Σ residual ALE, compared with the Board risk appetite.
- KPI 18 divides KPI 3 by the annual security investment for a risk-efficiency ratio. It is not a cash ROI.

## 4. Productivity value

`KPI 6 = Σ (hours saved × BU loaded hourly rate)`, where hours saved = (manual baseline minutes − agent end-to-end minutes) ÷ 60 for comparable tasks (KPI 29). End-to-end time always includes human review, waiting, retries and rework. Capacity is reported separately from cash and is not added to KPI 5.

## 5. Cost attribution

| Cost | Allocation key | KPI |
|---|---|---|
| Inference (provider-billed) | Direct by request (agent, tenant, model) | 61 |
| AI infrastructure (GPU, Kubernetes, vector DB, gateway, storage, network, observability) | Token share by tenant-month | 62 |
| AI platform licences | Token share | 63 |
| Security automation platforms (SOAR etc.) | Task share | 7 |
| Automation engineering labour | Task share | 7 |

Gross budget overrun (KPI 68) sums positive overruns per tenant-month, so under-spend in one BU never hides over-spend in another.

## 6. Token normalisation rules

- Total = input tokens (including cached) + output tokens (including reasoning).
- Providers that report reasoning tokens outside output have them added to output at ingestion; providers that report cached tokens separately have them added inside input.
- Cost = Σ per model (uncached input × input price + cached input × cache price + output × output price) ÷ 10⁶, using the price list valid on the request date.

## 7. Availability taxonomy

| Failure class | Counts against |
|---|---|
| Provider 5xx / outage | Model availability (71) |
| Internal model-serving 5xx | Model availability (71) |
| Timeout | Model availability (71) |
| Rate limited (429: TPM, RPM, quota) | Token / quota KPIs (58, 91-93), not availability |
| Gateway failure | Infrastructure (101, 113) |
| Network failure | Infrastructure (101, 114) |
| Client / application error (4xx) | Excluded from availability |

Business-service availability (per critical workflow) is tracked separately from request-level availability: impact minutes of outages affecting the workflow, shortened where fallback succeeded.

## 8. Framework applicability before scoring

Compliance scores are computed only over control instances whose mapped frameworks apply to the BU (for example CBUAE and PCI DSS for Financial Services, ADHICS for Healthcare, IEC 62443 for Energy). Non-applicable frameworks show "N/A" and never lower a score. Applicability is illustrative in the synthetic dataset and must be confirmed with Legal / Compliance.
