# RAG threshold and alerting logic

## 1. Status (RAG) per KPI

Each KPI declares a **direction** (higher or lower is better), a **target**, a **warning** threshold and a **critical** threshold.

| Status | Rule (higher is better; mirrored for lower is better) | Colour + icon |
|---|---|---|
| On target | value ≥ target | green, check |
| Watch | warning < value < target | yellow, half-circle |
| Warning | critical < value ≤ warning | orange, triangle |
| Critical | value ≤ critical | red, octagon |
| No target | informational KPI (volume / component) | grey |

Status is never conveyed by colour alone: every status carries an icon and a label.

### Scaling of absolute targets

- Ratio targets (%, ×, minutes per task) are scope-independent.
- Absolute flow targets (AED, hours, counts) are **per month × months in period**.
- For a business-unit or tenant view, absolute targets are pro-rated by the scope's share of a reference measure: baseline ALE (financial KPIs), tasks (efficiency / automation cost) or tokens (token KPIs).
- Where a filter makes an absolute target meaningless (e.g. one model, one environment), the target is suppressed and the KPI is shown as "Target n/a for this slice".
- Some KPIs are rated on a derived figure: Cached Input Tokens on cache-hit ratio, Cross-Border Transfers on unapproved transfers, Major Incidents Mitigated on mitigation rate.

## 2. Normalised risk (0-100)

```
risk(v) = 0                                   if v meets target
        = 50 × (v − T) / (W − T)              between target and warning
        = 50 + 50 × (v − W) / (C − W)         between warning and critical
        = 100                                 at or beyond critical
```

`T`, `W`, `C` = target, warning, critical (signs mirrored for higher-is-better KPIs).

## 3. Composite indices

| Index | Groups (weight) | Bands |
|---|---|---|
| **X6 Agentic Security Risk Score** | Successful unauthorized tool calls #129 (15%) · High-risk block effectiveness #132 (15%) · Successful prompt injection #133 (15%) · Sensitive-data violation rate #136 (10%) · Privilege exposure #138 (10%) · Kill-switch coverage #142 (10%) · Shadow AI exposure #127 (10%) · Unsafe autonomous execution #150 (5%) · Unregistered MCP servers #139 (5%) · Trace coverage #145 (5%) | target ≤ 30, warning 50, critical 70 |
| **X2 Agentic Enterprise Risk Index** | Agent security X6 (30%) · Model availability #71 #82 #83 #84 (20%) · Infrastructure resilience #101 #109 #118 #119 #122 (20%) · Token / cost exposure #52 #54 #68 #97 (15%) · Governance #151 #154 #155 #156 #161 (15%) | target ≤ 30, warning 45, critical 60 |
| **X1 Enterprise Cyber Risk Score** | Residual loss exposure vs appetite #4 (30%) · Incident response #14 #15 (20%) · Control effectiveness #155 #161 (15%) · Agentic enterprise risk X2 (35%) | 0-20 low (target), 20-40 moderate, 40-60 high (warning), 60+ critical |

Group risk = mean normalised risk of its KPIs; index = Σ(group risk × weight) ÷ Σ weights of groups with data. Missing groups are excluded and the weights re-normalised; the dashboard shows the component table for every index.

## 4. Alert rules

Deadlines run from the data snapshot: Critical 7 days, High 14 days, Medium 30 days.

| # | Alert | Trigger | Severity | Owner | Executive decision required |
|---|---|---|---|---|---|
| 1 | Critical model outage | Any High / Critical model outage in period | Critical if any Critical outage, else High | AI Platform Owner | Fund multi-provider fallback for critical workflows |
| 2 | AI provider SLA / SLO violation | KPI 86 > 0 deployment-months below SLO | High if ≥ 3, else Medium | AI Platform Owner | Claim SLA credits; add availability clauses at renewal |
| 3 | Token quota exhaustion | KPI 97 projected ≥ 95% of commitment, or KPI 93 > 0 | Critical if ≥ 100%, else High | AI FinOps Lead | Raise commitment or accept throttling of non-critical agents |
| 4 | Sudden uncontrolled token consumption | KPI 95 / 96 / 98 in Warning or Critical, or token growth (53) beyond task growth + 15 pp | High / Critical | AI FinOps Lead | Mandatory per-agent token budgets before go-live |
| 5 | Excessive AI spending | KPI 67 or 68 in Warning or Critical | High / Critical | CFO with AI FinOps Lead | BU chargeback and budget re-forecast |
| 6 | GPU / infrastructure capacity exhaustion | KPI 109 or 110 in Warning or Critical | High / Critical | Head of Infrastructure | GPU capex or cloud-burst contract |
| 7 | Failed model failover | Any outage with fallback / failover tried and failed | High | Head of Resilience | Quarterly failover evidence for critical workflows |
| 8 | Critical AI application without fallback | KPI 83 < 100% | Critical if < 75%, else High | AI Platform Owner | Fallback as a go-live gate |
| 9 | Unauthorized agent tool execution | KPI 129 > 0 | Critical / High | CISO | Deny-by-default tool authorisation within 30 days |
| 10 | Successful prompt injection | KPI 133 > 0 | Critical / High | CISO | Red-team expansion and guardrail upgrade |
| 11 | Sensitive-data leakage | KPI 136 in Warning or Critical, or AI data-leakage incidents | High / Critical | Data Protection Officer | Mandatory gateway redaction |
| 12 | Shadow AI discovery | KPI 126 > 0 or new shadow AI apps in period | Medium-Critical by KPI 126 / 127 status | CISO | Sanctioned AI catalogue and blocking policy |
| 13 | Agents with excessive permissions | KPI 137 > 0 | High / Critical | Head of IAM | Just-in-time privilege for agents |
| 14 | Kill-switch gaps and failed drills | Failed drill in period or KPI 141 > 0 | Critical if ≥ 5 agents or KPI 142 critical | Head of AI Governance | Tested kill switch as a hard go-live gate |
| 15 | Unapproved agent delegation | KPI 140 > 0 | Medium / High | Head of AI Governance | Enforce delegation policy AIC-11 |
| 16 | AI control failures | Control tested ineffective in period, or KPI 156 in Warning or Critical | High / Critical | Head of GRC | Approve remediation plan and owners |
| 17 | Unapproved cross-border transfers | KPI 146 unapproved > 0 | High | Data Protection Officer | Confirm AI data-residency policy |

Every alert lists the **affected critical services** (critical workflows of the agents or components involved), owner, business impact (with AED where available), mitigation, remediation deadline and the executive decision required. "Leadership priorities" on the executive page are the top five alerts by severity.

## 5. Notification routing (production)

| Severity | Channel | Escalation |
|---|---|---|
| Critical | SOAR case + page on-call owner + CISO notification | Executive committee within 24 h |
| High | SOAR case + owner e-mail / chat | CISO weekly review |
| Medium | Owner queue | Monthly governance forum |
