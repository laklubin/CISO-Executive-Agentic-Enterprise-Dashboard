# Required log fields and telemetry mappings

The KPI layer needs a small, consistent set of fields from each source. Field names below use the canonical names of the KPI layer; the right-hand columns show typical source fields. OpenTelemetry attribute names follow the GenAI semantic conventions, which are still evolving, so pin the semantic-convention version used by your collector and map accordingly.

## 1. Inference request (AI gateway / model provider)

| Canonical field | Purpose (KPIs) | Typical source fields |
|---|---|---|
| `request_id`, `trace_id`, `span_id` | Drill-down, trace coverage (145) | Gateway request ID; W3C `traceparent` |
| `timestamp_start`, `timestamp_end`, `ttft_ms` | Latency P95, TTFT P95 (79-80) | Gateway timings; streaming first-chunk time |
| `agent_id`, `session_id`, `task_id` | All agent KPIs | Gateway header / OTel `gen_ai.agent.id`, custom `agent.session.id` |
| `tenant_id`, `bu_id`, `application_id`, `workflow_id`, `environment` | Scoping, RLS | API key / workload identity → crosswalk |
| `provider_id`, `model_id`, `model_version`, `region` | Model KPIs, residency (146) | `gen_ai.provider.name` (or `gen_ai.system`), `gen_ai.request.model`, `gen_ai.response.model` |
| `tokens_input`, `tokens_cached_input`, `tokens_output`, `tokens_reasoning` | Token & cost KPIs (43-70) | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`; provider usage details for cached / reasoning tokens |
| `finish_reason` | Output-limit hits (57) | `gen_ai.response.finish_reasons` (`length`) |
| `http_status`, `error_class` | Availability taxonomy (71-78, 101, 113-114) | Status code + gateway classification: `client_4xx`, `rate_limited_429`, `provider_5xx`, `serving_5xx`, `timeout`, `gateway_fail`, `network_fail` |
| `rate_limit_type` | TPM / RPM events (91-92) | Provider 429 headers / gateway limiter |
| `context_exceeded` | Context-window KPIs (56, 90) | Provider error code for context length |
| `fallback_attempted`, `fallback_succeeded`, `fallback_model_id` | Fallback KPIs (82) | Gateway router decision log |
| `cache_hit_tokens` | Cache saving (47, 70) | Provider usage details |
| `dlp_classes`, `redaction_applied`, `policy_violation` | Sensitive data (135-136) | Gateway DLP verdict |
| `guardrail_verdict` | Prompt injection (133-134) | Guardrail classifier / content-safety service |
| `cost_aed` | Inference spend (61) | Computed: tokens × contracted price per model (price table versioned by date) |

## 2. Agent run, span and tool call (orchestrator, MCP / tool gateway)

| Canonical field | Purpose | Notes |
|---|---|---|
| `run_id`, `task_id`, `parent_run_id` | Task outcomes (22-23, 31-41), delegation (140) | One run per task attempt; parent for delegation |
| `outcome` | Success / failure / escalation | `succeeded`, `failed`, `escalated`, `abandoned` |
| `autonomy_eligible`, `completed_autonomously` | Autonomy (31-32) | From the policy engine at task start |
| `human_review_ms`, `wait_ms`, `retry_ms`, `rework_ms`, `exec_ms` | End-to-end time (24-29) | Review queue and workflow-engine timestamps |
| `baseline_cohort_id` | Comparable tasks | Links to the approved manual baseline |
| `tool_name`, `tool_id`, `mcp_server_id`, `action`, `resource` | Tool KPIs (128-131) | OTel `gen_ai.tool.name`, `gen_ai.tool.call.id`; MCP server identity |
| `authz_decision`, `authz_policy_id`, `executed` | Authorisation (128-132) | `allow`, `deny`, `deny_bypassed` |
| `high_risk`, `approval_id` | Approval compliance (34) | Approval service reference |
| `loop_detected`, `token_anomaly` | Runaway loops (96), excessive consumption (95) | Loop-detector / anomaly service |
| `trace_complete` | Trace coverage (145) | True when all nine attributes are present: user, agent, session, model, tool, action, resource, authorisation, result |

## 3. Security telemetry (SIEM / SOAR / EDR / DLP / CASB / IAM)

| Canonical field | KPIs | Typical source |
|---|---|---|
| `incident_id`, `severity`, `type`, `tenant_id`, `opened_at`, `detected_at`, `contained_at`, `closed_at` | 13-15, X3 | SOAR case (e.g. FortiSOAR), SIEM incident (Sentinel / Splunk notable) |
| `controls_involved[]`, `primary_control` | 2, 11, 17 | SOAR playbook / analyst classification |
| `potential_loss_aed`, `prevented_loss_aed`, `actual_loss_aed`, `finance_validation_id` | 2, 11, 13, 19 | Loss-exposure worksheet + Finance validation |
| `ai_related`, `agent_id` | 19, 147 | SOC classification and trace link |
| `dlp_event_id`, `channel`, `action`, `disposition` | 12 | DLP console / API |
| `casb_app`, `sanctioned`, `user_id`, `first_seen` | 125-127 | CASB / SWG discovery |
| `workload_identity`, `credential_type`, `entitlements[]`, `last_used` | 137-138, 144 | IAM / PAM / entitlement analytics |

## 4. Infrastructure telemetry

| Canonical metric | KPIs | Typical source metric |
|---|---|---|
| GPU utilisation, SM activity | 106 | DCGM exporter `DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_PROF_SM_ACTIVE` |
| GPU memory used / free | 107 | `DCGM_FI_DEV_FB_USED`, `DCGM_FI_DEV_FB_FREE` |
| GPU errors (Xid) | 104-105 | `DCGM_FI_DEV_XID_ERRORS`, node drain / RMA tickets |
| Node readiness | 111 | kube-state-metrics `kube_node_status_condition` |
| Pod failures / restarts | 112 | `kube_pod_container_status_restarts_total`, `kube_pod_container_status_last_terminated_reason` |
| Queue wait time | 117 | Inference server queue histogram (e.g. vLLM request queue metrics) |
| Component request success | 101, 113-116 | Gateway / LB / vector DB request metrics, synthetic probes |
| DR tests, RTO / RPO results | 118-120, 122 | BCM / DR test register |
| Monitored assets | 123 | CMDB reconciliation against monitoring inventory |

## 5. Finance, governance and operations

| Canonical field | KPIs | Source |
|---|---|---|
| `ledger_entry_id`, `cost_center`, `control_family`, `amount_aed`, `status`, `approval_id`, `effective_date` | 1, 5, 7, 17 | ERP + benefit-approval workflow |
| `budget_aed`, `token_budget` per tenant-month | 43, 54-55, 63, 67-69, 94 | AI FinOps budget |
| `loaded_rate_aed_per_hour` per BU | 6 | HR / Finance |
| `analyst_fte`, `cases_closed` | 30 | HR / ITSM |
| `control_instance_id`, `applicable`, `implemented_at`, `test_date`, `test_result`, `drift_detected_at` | 154-156, 163 | GRC platform, policy-as-code |
| `finding_id`, `severity`, `due_date`, `closed_at` | 157 | GRC findings tracker |
| `exception_id`, `opened_at`, `expires_at`, `closed_at` | 164 | Exception register |
| `vendor_id`, `assessed_at` | 158 | TPRM |
| `technique_id`, `detection_validated_at` | 161 | Detection engineering (ATLAS mapping) |
| `artifact_id`, `signature_verified`, `aibom_present`, `scan_result` | 162 | Artifact registry |

## 6. Minimum retention

| Data | Retention | Reason |
|---|---|---|
| Request / span metadata | 13 months online, 7 years archived (regulated BUs) | Year-on-year comparisons; audit |
| Aggregated facts | 7 years | Trend and board reporting |
| Prompt / completion content | Not stored in the KPI layer | Privacy and data minimisation |
| Evidence references | Life of the KPI record | Drill-down to evidence |
