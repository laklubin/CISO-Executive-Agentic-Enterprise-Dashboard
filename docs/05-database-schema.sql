-- ============================================================================
-- CISO Executive Agentic Enterprise Dashboard: normalised KPI data layer
-- Target: PostgreSQL 15+ (row-level security for tenant isolation)
-- The dashboard's synthetic data module (assets/js/data.js) uses the same shapes.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS dim;
CREATE SCHEMA IF NOT EXISTS fact;
CREATE SCHEMA IF NOT EXISTS rec;
CREATE SCHEMA IF NOT EXISTS kpi;
CREATE SCHEMA IF NOT EXISTS sec;

-- ---------------------------------------------------------------- dimensions
CREATE TABLE dim.month (
  month_key      date PRIMARY KEY,               -- first day of month (GST)
  label          text NOT NULL,                  -- 'Oct 2026'
  days_in_month  smallint NOT NULL CHECK (days_in_month BETWEEN 28 AND 31)
);

CREATE TABLE dim.business_unit (
  bu_id              text PRIMARY KEY,           -- FIN, HLT, ENR, GOV, GSS
  name               text NOT NULL,
  loaded_rate_aed_h  numeric(10,2) NOT NULL      -- fully loaded hourly rate for productivity value
);

CREATE TABLE dim.tenant (
  tenant_id  text PRIMARY KEY,
  bu_id      text NOT NULL REFERENCES dim.business_unit,
  name       text NOT NULL,
  users      integer,
  analyst_fte numeric(8,2)
);

CREATE TABLE dim.application (
  application_id text PRIMARY KEY,
  name           text NOT NULL,
  owner_role     text NOT NULL
);

CREATE TABLE dim.workflow (
  workflow_id          text PRIMARY KEY,
  name                 text NOT NULL,
  security_control     text NOT NULL,            -- control family for value attribution
  manual_minutes_task  numeric(10,2) NOT NULL,   -- approved manual baseline
  baseline_study_ref   text NOT NULL,
  is_critical          boolean NOT NULL,
  risk_tier            text NOT NULL CHECK (risk_tier IN ('High','Medium','Low')),
  bia_cost_per_minute  numeric(12,2) NOT NULL    -- business impact analysis, AED / minute
);

CREATE TABLE dim.provider (
  provider_id text PRIMARY KEY,                  -- 'Azure OpenAI', 'AWS Bedrock', 'On-prem vLLM'
  hosting     text NOT NULL CHECK (hosting IN ('external','internal'))
);

CREATE TABLE dim.model (
  model_id        text PRIMARY KEY,
  provider_id     text NOT NULL REFERENCES dim.provider,
  name            text NOT NULL,
  region          text NOT NULL,
  residency       text NOT NULL,                 -- 'UAE', 'EU', ...
  is_embedding    boolean NOT NULL DEFAULT false,
  is_reasoning    boolean NOT NULL DEFAULT false,
  slo_pct         numeric(6,3) NOT NULL
);

-- versioned price list: provider-specific billing rules (AED per million tokens)
CREATE TABLE dim.model_price (
  model_id        text REFERENCES dim.model,
  valid_from      date NOT NULL,
  valid_to        date,
  price_in_aed    numeric(12,4) NOT NULL,
  price_cache_aed numeric(12,4) NOT NULL,
  price_out_aed   numeric(12,4) NOT NULL,
  reasoning_billed_as_output boolean NOT NULL DEFAULT true,
  PRIMARY KEY (model_id, valid_from)
);

CREATE TABLE dim.agent (                          -- SCD type 2
  agent_sk          bigserial PRIMARY KEY,
  agent_id          text NOT NULL,
  name              text NOT NULL,
  tenant_id         text NOT NULL REFERENCES dim.tenant,
  application_id    text NOT NULL REFERENCES dim.application,
  workflow_id       text NOT NULL REFERENCES dim.workflow,
  primary_model_id  text NOT NULL REFERENCES dim.model,
  fallback_model_id text REFERENCES dim.model,
  fallback_tested_at date,
  autonomy_level    text NOT NULL,
  owner_user_id     text,                          -- NULL = no accountable owner (KPI 143)
  workload_identity boolean NOT NULL,              -- KPI 144
  kill_switch_at    date,                          -- KPI 141-142
  trace_enabled_at  date,
  siem_enabled_at   date,                          -- KPI 160
  threat_model_at   date,                          -- KPI 153
  governed_at       date,                          -- KPI 151
  xborder_approved_at date,                        -- KPI 146
  status            text NOT NULL CHECK (status IN ('active','paused','decommissioned')),
  valid_from        timestamptz NOT NULL,
  valid_to          timestamptz,
  UNIQUE (agent_id, valid_from)
);

CREATE TABLE dim.component (
  resource_id text PRIMARY KEY,
  name        text NOT NULL,
  type        text NOT NULL,                       -- gpu, k8s, serving, gateway, lb, network, storage, vectordb
  is_critical boolean NOT NULL
);

CREATE TABLE dim.framework (
  framework_id text PRIMARY KEY,
  name         text NOT NULL,
  scope_note   text
);
CREATE TABLE dim.framework_applicability (       -- determined BEFORE compliance scoring
  framework_id text REFERENCES dim.framework,
  bu_id        text REFERENCES dim.business_unit,
  applicable   boolean NOT NULL,
  rationale    text NOT NULL,
  PRIMARY KEY (framework_id, bu_id)
);

CREATE TABLE dim.control (
  control_id     text PRIMARY KEY,
  name           text NOT NULL,
  control_family text NOT NULL                     -- SOC, SIEM, SOAR, ... , AI Agents
);
CREATE TABLE dim.control_framework_map (
  control_id   text REFERENCES dim.control,
  framework_id text REFERENCES dim.framework,
  requirement_ref text,
  PRIMARY KEY (control_id, framework_id)
);

CREATE TABLE dim.source_system (
  source_id     text PRIMARY KEY,
  name          text NOT NULL,
  cadence       text NOT NULL,
  last_refresh  timestamptz,
  completeness_pct numeric(5,2)
);

-- canonical identifier crosswalk (API keys, service principals, pod labels, CMDB CIs ...)
CREATE TABLE dim.identifier_map (
  source_id      text REFERENCES dim.source_system,
  source_key     text NOT NULL,
  entity_type    text NOT NULL,                    -- agent, tenant, model, tool, resource, cost_center
  canonical_id   text NOT NULL,
  PRIMARY KEY (source_id, source_key, entity_type)
);

-- ---------------------------------------------------------------- facts
CREATE TABLE fact.agent_activity (
  month_key   date NOT NULL REFERENCES dim.month,
  agent_id    text NOT NULL,
  model_id    text NOT NULL REFERENCES dim.model,
  environment text NOT NULL CHECK (environment IN ('prod','nonprod')),
  tenant_id   text NOT NULL REFERENCES dim.tenant,   -- denormalised for RLS
  is_primary_model boolean NOT NULL,                 -- task outcomes recorded on the primary model row
  tasks bigint NOT NULL DEFAULT 0, succ bigint NOT NULL DEFAULT 0, fail bigint NOT NULL DEFAULT 0, escal bigint NOT NULL DEFAULT 0,
  elig bigint NOT NULL DEFAULT 0, auto bigint NOT NULL DEFAULT 0, interv bigint NOT NULL DEFAULT 0, ftr bigint NOT NULL DEFAULT 0,
  rework bigint NOT NULL DEFAULT 0, err_ev bigint NOT NULL DEFAULT 0, recov bigint NOT NULL DEFAULT 0, sla_elig bigint NOT NULL DEFAULT 0, sla_met bigint NOT NULL DEFAULT 0,
  cmp bigint NOT NULL DEFAULT 0,
  man_min numeric(16,2) NOT NULL DEFAULT 0, exec_min numeric(16,2) NOT NULL DEFAULT 0, review_min numeric(16,2) NOT NULL DEFAULT 0,
  wait_min numeric(16,2) NOT NULL DEFAULT 0, retry_min numeric(16,2) NOT NULL DEFAULT 0, rework_min numeric(16,2) NOT NULL DEFAULT 0,
  e2e_min numeric(16,2) GENERATED ALWAYS AS (exec_min + review_min + wait_min + retry_min + rework_min) STORED,
  prod_aed numeric(16,2) NOT NULL DEFAULT 0,
  appr_req bigint NOT NULL DEFAULT 0, appr_ok bigint NOT NULL DEFAULT 0, runs bigint NOT NULL DEFAULT 0, traced bigint NOT NULL DEFAULT 0,
  auto_exec bigint NOT NULL DEFAULT 0, unsafe_auto bigint NOT NULL DEFAULT 0,
  tool_exec bigint NOT NULL DEFAULT 0, tool_unauth_att bigint NOT NULL DEFAULT 0, tool_unauth_ok bigint NOT NULL DEFAULT 0,
  hr_att bigint NOT NULL DEFAULT 0, hr_blk bigint NOT NULL DEFAULT 0, pi_att bigint NOT NULL DEFAULT 0, pi_ok bigint NOT NULL DEFAULT 0,
  sens_req bigint NOT NULL DEFAULT 0, sens_expo bigint NOT NULL DEFAULT 0, sens_viol bigint NOT NULL DEFAULT 0,
  a2a_unauth bigint NOT NULL DEFAULT 0, xb bigint NOT NULL DEFAULT 0, xb_unapproved bigint NOT NULL DEFAULT 0,
  loops bigint NOT NULL DEFAULT 0, tok_anom bigint NOT NULL DEFAULT 0, spikes bigint NOT NULL DEFAULT 0,
  tok_in bigint NOT NULL DEFAULT 0, tok_cached bigint NOT NULL DEFAULT 0, tok_out bigint NOT NULL DEFAULT 0, tok_reason bigint NOT NULL DEFAULT 0, tok_waste bigint NOT NULL DEFAULT 0,
  cost_inf_aed numeric(16,4) NOT NULL DEFAULT 0, cache_save_aed numeric(16,4) NOT NULL DEFAULT 0,
  req bigint NOT NULL DEFAULT 0, e_app bigint NOT NULL DEFAULT 0, e_rl bigint NOT NULL DEFAULT 0, rl_tpm bigint NOT NULL DEFAULT 0, rl_rpm bigint NOT NULL DEFAULT 0,
  tpm_ev bigint NOT NULL DEFAULT 0, rpm_ev bigint NOT NULL DEFAULT 0, rl_recov bigint NOT NULL DEFAULT 0,
  e_gw bigint NOT NULL DEFAULT 0, e_net bigint NOT NULL DEFAULT 0, e_prov bigint NOT NULL DEFAULT 0, e_srv bigint NOT NULL DEFAULT 0, e_to bigint NOT NULL DEFAULT 0,
  ctx_exc bigint NOT NULL DEFAULT 0, out_lim bigint NOT NULL DEFAULT 0, fb_elig bigint NOT NULL DEFAULT 0, fb_ok bigint NOT NULL DEFAULT 0,
  gen_sec numeric(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, agent_id, model_id, environment),
  -- subset constraints that prevent double counting
  CHECK (tok_cached <= tok_in), CHECK (tok_reason <= tok_out),
  CHECK (succ + fail + escal = tasks), CHECK (auto <= elig AND auto <= succ), CHECK (ftr <= succ),
  CHECK (tool_unauth_ok <= tool_unauth_att), CHECK (hr_blk <= hr_att), CHECK (pi_ok <= pi_att),
  CHECK (sens_viol <= sens_expo AND sens_expo <= sens_req), CHECK (traced <= runs), CHECK (fb_ok <= fb_elig)
);
CREATE INDEX ON fact.agent_activity (tenant_id, month_key);
CREATE INDEX ON fact.agent_activity (model_id, month_key);

CREATE TABLE fact.infra_component_month (
  month_key  date NOT NULL REFERENCES dim.month,
  resource_id text NOT NULL REFERENCES dim.component,
  req bigint, ok bigint, gpus integer, gpu_hrs_sched numeric, gpu_hrs_avail numeric, gpu_busy_hrs numeric, gpu_mem_hi_hrs numeric,
  gpu_fail integer, sat_events integer, peak_demand numeric, node_hrs_sched numeric, node_hrs_ready numeric,
  pod_starts bigint, pod_fails bigint, fo_tests integer, fo_ok integer, rto_tests integer, rto_met integer, rpo_tests integer, rpo_met integer,
  assets integer, monitored integer, cost_aed numeric(14,2),
  PRIMARY KEY (month_key, resource_id),
  CHECK (ok <= req), CHECK (gpu_hrs_avail <= gpu_hrs_sched), CHECK (monitored <= assets)
);

CREATE TABLE fact.tenant_month (
  month_key date NOT NULL REFERENCES dim.month,
  tenant_id text NOT NULL REFERENCES dim.tenant,
  infra_aed numeric(14,2), lic_aed numeric(14,2), plat_aed numeric(14,2), lab_aed numeric(14,2),
  bud_ai_aed numeric(14,2), bud_tokens bigint, tokens bigint, ai_spend_aed numeric(14,2),
  dlp_blocked integer, dlp_false_pos integer, analyst_fte numeric(8,2), cases_closed integer,
  users integer, shadow_ai_users integer, auto_in_scope integer, auto_done integer,
  PRIMARY KEY (month_key, tenant_id)
);

-- ---------------------------------------------------------------- records
CREATE TABLE rec.incident (
  incident_id  text PRIMARY KEY,
  tenant_id    text NOT NULL REFERENCES dim.tenant,
  opened_at    timestamptz NOT NULL,
  severity     text NOT NULL CHECK (severity IN ('Critical','High','Medium','Low')),
  type         text NOT NULL,
  ai_related   boolean NOT NULL,
  fraud        boolean NOT NULL,
  major        boolean GENERATED ALWAYS AS (severity = 'Critical' OR (severity = 'High' AND potential_loss_aed >= 1000000)) STORED,
  mitigated    boolean NOT NULL,
  detect_hours numeric(8,2), contain_hours numeric(8,2),
  potential_loss_aed numeric(16,2) NOT NULL,
  prevented_loss_aed numeric(16,2) NOT NULL DEFAULT 0,   -- Finance / Risk validated, counted once
  finance_validation_id text,
  actual_loss_aed numeric(16,2) NOT NULL DEFAULT 0,
  response_cost_aed numeric(16,2) NOT NULL DEFAULT 0,
  evidence_ref text
);

-- control attribution: weights per incident must sum to 1 (deferred check via trigger)
CREATE TABLE rec.incident_control_attribution (
  incident_id    text REFERENCES rec.incident,
  control_family text NOT NULL,
  weight         numeric(6,5) NOT NULL CHECK (weight > 0 AND weight <= 1),
  gross_claim_aed numeric(16,2) NOT NULL,                  -- what the control owner claimed
  attributed_aed  numeric(16,2) NOT NULL,                  -- prevented_loss_aed x weight (rounding remainder on primary)
  is_primary     boolean NOT NULL,
  PRIMARY KEY (incident_id, control_family)
);

CREATE TABLE rec.value_ledger (                            -- Finance-approved realised savings
  entry_id       text PRIMARY KEY,
  tenant_id      text NOT NULL REFERENCES dim.tenant,
  month_key      date NOT NULL REFERENCES dim.month,
  control_family text NOT NULL,
  description    text NOT NULL,
  amount_aed     numeric(16,2) NOT NULL CHECK (amount_aed >= 0),
  status         text NOT NULL CHECK (status IN ('Approved','Pending','Rejected')),
  approval_id    text,
  gl_posting_ref text,
  CHECK (status <> 'Approved' OR approval_id IS NOT NULL)
);

CREATE TABLE rec.risk_scenario_snapshot (                  -- FAIR register, monthly
  month_key  date NOT NULL REFERENCES dim.month,
  tenant_id  text NOT NULL REFERENCES dim.tenant,
  scenario_id text NOT NULL,
  baseline_lef numeric(10,4), baseline_lm_aed numeric(16,2),
  residual_lef numeric(10,4), residual_lm_aed numeric(16,2),
  PRIMARY KEY (month_key, tenant_id, scenario_id)
);

CREATE TABLE rec.outage (
  outage_id   text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('model','infra')),
  model_id    text REFERENCES dim.model,
  resource_id text REFERENCES dim.component,
  cause_class text NOT NULL,                 -- provider outage, internal serving failure, gateway, network, capacity ...
  severity    text NOT NULL,
  started_at  timestamptz NOT NULL, detected_at timestamptz NOT NULL, recovered_at timestamptz NOT NULL,
  fallback_attempted boolean, fallback_succeeded boolean,
  impact_estimated_aed numeric(14,2), impact_actual_aed numeric(14,2), avoided_aed numeric(14,2),
  CHECK ((kind = 'model' AND model_id IS NOT NULL) OR (kind = 'infra' AND resource_id IS NOT NULL))
);
CREATE TABLE rec.outage_impact (            -- links failures to agents, customers, applications and workflows
  outage_id text REFERENCES rec.outage, agent_id text, workflow_id text REFERENCES dim.workflow,
  tenant_id text REFERENCES dim.tenant, impact_minutes numeric(10,2),
  PRIMARY KEY (outage_id, agent_id)
);

CREATE TABLE rec.quota_snapshot (
  month_key date, model_id text REFERENCES dim.model,
  peak_tpm numeric, tpm_limit numeric, peak_rpm numeric, rpm_limit numeric,
  tokens bigint, commitment_tokens bigint, exhausted boolean, exhaust_days integer, impact_aed numeric(14,2),
  PRIMARY KEY (month_key, model_id)
);

CREATE TABLE rec.agent_session (
  session_id text PRIMARY KEY, agent_id text NOT NULL, tenant_id text NOT NULL REFERENCES dim.tenant,
  user_ref text, started_at timestamptz NOT NULL, model_id text REFERENCES dim.model, tokens bigint, trace_complete boolean
);
CREATE TABLE rec.agent_span (              -- User -> Agent -> Session -> Model -> Tool -> Action -> Resource -> Authorization -> Result
  span_id text PRIMARY KEY, session_id text REFERENCES rec.agent_session, trace_id text NOT NULL,
  span_type text NOT NULL CHECK (span_type IN ('user','agent','guard','model','tool','result')),
  name text, action text, resource text, authz_decision text, result text,
  started_at timestamptz, duration_ms integer
);

CREATE TABLE rec.control_instance (
  control_id text REFERENCES dim.control, bu_id text REFERENCES dim.business_unit,
  applicable boolean NOT NULL, implemented_at date,
  PRIMARY KEY (control_id, bu_id)
);
CREATE TABLE rec.control_test (
  control_id text, bu_id text, tested_at date NOT NULL, effective boolean NOT NULL, evidence_ref text,
  PRIMARY KEY (control_id, bu_id, tested_at),
  FOREIGN KEY (control_id, bu_id) REFERENCES rec.control_instance
);
CREATE TABLE rec.audit_finding (finding_id text PRIMARY KEY, bu_id text, severity text, framework_id text, opened_at date, due_at date, closed_at date, title text);
CREATE TABLE rec.risk_exception (exception_id text PRIMARY KEY, bu_id text, severity text, opened_at date, expires_at date, closed_at date, title text);
CREATE TABLE rec.kill_switch_drill (agent_id text, drilled_at date, passed boolean, evidence_ref text, PRIMARY KEY (agent_id, drilled_at));

-- ---------------------------------------------------------------- multi-tenant isolation (row-level security)
CREATE TABLE sec.user_scope (
  scope_id  bigserial PRIMARY KEY,
  user_id   text NOT NULL,
  role      text NOT NULL,                  -- group_ciso, cfo, bu_ciso, soc_manager, ai_governance, auditor
  bu_id     text REFERENCES dim.business_unit,  -- NULL = all BUs
  tenant_id text REFERENCES dim.tenant,         -- NULL = all tenants in BU
  UNIQUE NULLS NOT DISTINCT (user_id, role, bu_id, tenant_id)
);

CREATE OR REPLACE FUNCTION sec.can_see_tenant(p_tenant text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM sec.user_scope s JOIN dim.tenant t ON t.tenant_id = p_tenant
    WHERE s.user_id = current_setting('app.user_id', true)
      AND (s.bu_id IS NULL OR s.bu_id = t.bu_id)
      AND (s.tenant_id IS NULL OR s.tenant_id = t.tenant_id))
$$;

ALTER TABLE fact.agent_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fact.agent_activity USING (sec.can_see_tenant(tenant_id));
ALTER TABLE fact.tenant_month ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fact.tenant_month USING (sec.can_see_tenant(tenant_id));
ALTER TABLE rec.incident ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rec.incident USING (sec.can_see_tenant(tenant_id));
ALTER TABLE rec.value_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rec.value_ledger USING (sec.can_see_tenant(tenant_id));
ALTER TABLE rec.risk_scenario_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rec.risk_scenario_snapshot USING (sec.can_see_tenant(tenant_id));
ALTER TABLE rec.agent_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rec.agent_session USING (sec.can_see_tenant(tenant_id));

-- ---------------------------------------------------------------- example KPI views (same formulas as the dashboard)
-- KPI 27 Agentic Efficiency Gain and KPI 29 Human Hours Saved, per tenant and month
CREATE OR REPLACE VIEW kpi.v_efficiency AS
SELECT month_key, tenant_id,
       SUM(man_min) AS manual_min, SUM(e2e_min) AS e2e_min,
       100.0 * (SUM(man_min) - SUM(e2e_min)) / NULLIF(SUM(man_min), 0) AS efficiency_gain_pct,
       (SUM(man_min) - SUM(e2e_min)) / 60.0 AS hours_saved
FROM fact.agent_activity WHERE is_primary_model GROUP BY month_key, tenant_id;

-- KPI 43 Total Tokens Used: cached is inside input, reasoning inside output (never added again)
CREATE OR REPLACE VIEW kpi.v_tokens AS
SELECT month_key, tenant_id, model_id,
       SUM(tok_in) + SUM(tok_out) AS total_tokens,
       SUM(tok_cached) AS cached_tokens_subset, SUM(tok_reason) AS reasoning_tokens_subset
FROM fact.agent_activity GROUP BY month_key, tenant_id, model_id;

-- KPI 71 Model Availability: eligible = reached the model endpoint
CREATE OR REPLACE VIEW kpi.v_model_availability AS
SELECT month_key, model_id,
       100.0 * (SUM(req) - SUM(e_app + e_rl + e_gw + e_net) - SUM(e_prov + e_srv + e_to))
             / NULLIF(SUM(req) - SUM(e_app + e_rl + e_gw + e_net), 0) AS availability_pct
FROM fact.agent_activity GROUP BY month_key, model_id;

-- KPI 2 Confirmed Financial Loss Prevented: de-duplicated (one value per incident)
CREATE OR REPLACE VIEW kpi.v_loss_prevented AS
SELECT date_trunc('month', i.opened_at)::date AS month_key, i.tenant_id,
       SUM(a.gross_claim_aed) AS gross_control_claims_aed,
       SUM(a.attributed_aed)  AS loss_prevented_aed
FROM rec.incident i JOIN rec.incident_control_attribution a USING (incident_id)
WHERE i.prevented_loss_aed > 0 AND i.finance_validation_id IS NOT NULL
GROUP BY 1, 2;

-- KPI 1 Total Realized Cost Savings: Finance-approved only
CREATE OR REPLACE VIEW kpi.v_realized_savings AS
SELECT month_key, tenant_id, control_family, SUM(amount_aed) AS realized_savings_aed
FROM rec.value_ledger WHERE status = 'Approved' GROUP BY 1, 2, 3;
