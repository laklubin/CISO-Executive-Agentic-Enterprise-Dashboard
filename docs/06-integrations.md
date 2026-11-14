# Integration specifications and API connectors

Each connector lands raw data in the ingestion zone, normalises identifiers through the crosswalk, and loads the facts and records listed. All connectors authenticate with dedicated workload identities (no personal accounts), read-only scopes, secrets in a vault, and in-country network paths.

| # | Source | Method | Frequency | Loads | Key fields / notes |
|---|---|---|---|---|---|
| 1 | **AI gateway** (central LLM proxy) | Streaming log export (OTel / JSON over Kafka or Event Hubs) | Streaming | `fact_agent_activity` (requests, tokens, errors, 429s, fallback, DLP and guardrail verdicts) | System of record for request-level availability and token accounting; every request must carry agent ID and tenant through workload identity |
| 2 | **Azure OpenAI / Azure AI Foundry** | Azure Monitor metrics and diagnostic logs; Cost Management export | 1 min (metrics), daily (cost) | Quota usage, provisioned throughput utilisation, billing reconciliation | Reconcile gateway tokens to billed tokens monthly (tolerance ±2%) |
| 3 | **AWS Bedrock** | CloudWatch metrics, model invocation logging (CloudWatch Logs / S3), Cost and Usage Report | 1 min / daily | Invocations, latency, throttles, token counts, cost | Region tag drives residency classification (KPI 146) |
| 4 | **On-prem model serving** (e.g. vLLM) | Prometheus scrape | 30 s | Queue wait, throughput, errors, GPU mapping | Internal serving failures classified separately from provider failures |
| 5 | **Agent orchestrator / frameworks** | OpenTelemetry traces (OTLP) | Streaming | Runs, spans, outcomes, timings (exec, review, wait, retry, rework), delegation | Trace completeness check drives KPI 145 |
| 6 | **MCP servers & tool gateway** | Gateway decision logs; MCP registry API | Streaming / hourly | Tool calls, authorisation decisions, unregistered MCP servers | Deny-by-default decision log with policy ID |
| 7 | **Agent / model registry** | REST API | Hourly | `dim_agent` (SCD2), owners, kill switch, identity, threat model, risk assessment dates | Source of truth for KPIs 20, 137-153 |
| 8 | **GPU telemetry (DCGM exporter)** | Prometheus scrape | 30 s | GPU utilisation, memory, Xid errors | Aggregated to hourly / monthly in `fact_infra_component` |
| 9 | **Kubernetes** | kube-state-metrics, events API | 30 s | Node readiness, pod failures | AI namespaces only |
| 10 | **APM & synthetic probes** | API / OTel metrics | 1 min | Component availability, outage start / end | Used to corroborate request-level availability |
| 11 | **Microsoft Sentinel** | Log Analytics query API (KQL) | 5-15 min | Incidents, AI-detection alerts, telemetry health | Analytics rules tagged with ATLAS technique IDs for KPI 161 |
| 12 | **Splunk** | Search / REST API; HEC for write-back | 5-15 min | Notables, incidents, data-source health | Alternative / additional SIEM |
| 13 | **FortiSOAR (or other SOAR)** | REST API | 5 min | Cases, playbook runs, containment timestamps, control attribution, loss worksheets | Drives incident KPIs 13-15 and value attribution |
| 14 | **EDR/XDR, firewall, WAF, NDR** | Via SIEM; vendor APIs for config | 15 min / daily | Detections linked to incidents; control drift | Controls appear in attribution weights |
| 15 | **DLP (endpoint, email, AI gateway)** | API / SIEM | 15 min | Blocks, dispositions, sensitive-data classes | KPIs 12, 135-136 |
| 16 | **IAM / PAM / workload identity** | Graph / directory APIs; PAM API | Hourly | Workload identities, entitlements vs usage, JIT elevation | KPIs 137-138, 144 |
| 17 | **CASB / SWG** | API | Hourly | Shadow AI app discovery, users | KPIs 125-127 |
| 18 | **GRC platform** | REST API | Daily | Controls, tests, findings, exceptions, framework mapping | KPIs 154-164 |
| 19 | **CMDB & asset inventory** | REST API | Daily | Components, critical dependencies, SPOFs, monitored assets | KPIs 121-123 |
| 20 | **Vulnerability management & CTEM** | API | Daily | Exposure, supply-chain scans | KPI 162; control attribution |
| 21 | **Evaluation pipeline** | API / artefact store | Daily | Golden-set results, regressions, security evaluations | KPIs 87-89, 148 |
| 22 | **Third-party risk (TPRM)** | API | Weekly | AI vendor assessments | KPI 158 |
| 23 | **Finance ERP & benefit approvals** | Secure file export or API | Monthly close (+ daily for spend) | Approved savings ledger, budgets, allocations, invoices | Only `Approved` entries feed KPI 1 |
| 24 | **ITSM** | Table API | Hourly | Tickets, SLAs, reopen (rework), outage records, change records | KPIs 37, 41, 87-88 |
| 25 | **HR / timesheets** | Secure export | Monthly | Loaded rates per BU, analyst FTE | KPIs 6, 30 |
| 26 | **BCM / DR register** | API / export | Quarterly | DR tests, RTO / RPO results | KPIs 118-120, 122 |
| 27 | **Cyber risk register (FAIR)** | API / export | Monthly | Scenario LEF / LM baseline and residual | KPIs 3, 4, 18 |

## Connector contract

Every connector must provide:

1. **Schema contract** (versioned JSON schema) and a sample payload.
2. **Identifier mapping** to canonical IDs (agent, tenant, model, tool, resource, cost centre).
3. **Watermark-based incremental loads** with replay from a given timestamp.
4. **Data-quality checks**: completeness, timeliness, referential integrity and reconciliation totals.
5. **Lineage metadata**: source, extraction time, connector version, record counts.
6. **Security**: least-privilege read-only scope, secret rotation, TLS, in-country endpoints, audit logging.

## API exposed by the KPI layer

| Endpoint | Purpose |
|---|---|
| `GET /kpis?period=ytd&bu=FIN` | KPI values, status, thresholds for a scope |
| `GET /kpis/{id}/calculation?period=...` | Formula, inputs with sources, worked calculation (same content as the dashboard drawer) |
| `GET /kpis/{id}/series?months=12` | Monthly trend |
| `GET /kpis/{id}/breakdown?dim=bu` | Drill-down rows |
| `GET /records/{type}?kpi={id}` | Underlying records (paged, RLS-filtered) |
| `GET /alerts` | Current alerts with owner, deadline and decision required |
| `GET /exports/monthly-report?month=2026-10` | Board report (PDF / XLSX) |
