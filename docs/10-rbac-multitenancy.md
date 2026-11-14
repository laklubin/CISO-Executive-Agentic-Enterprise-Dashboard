# Role-based access and multi-tenant data isolation

## 1. Roles

| Role | Scope | Can see | Cannot see |
|---|---|---|---|
| Group CISO | All BUs and tenants | Everything, including records and traces | - |
| CFO / Finance | All BUs | Executive page, domain A, cost KPIs (C), exports | Session traces, prompt-level security events |
| Board Risk Committee | All BUs (aggregated) | Executive page, composites, alerts, monthly report | Records below BU level |
| BU CISO | Own BU and its tenants | All KPIs and records for the BU | Other BUs (row-level security) |
| SOC Manager | Assigned tenants | Domains A (incidents), G, records, traces | Finance ledger details |
| AI Governance | All BUs | Domains B, G, H, registry, controls, findings | Finance ledger details |
| AI Platform / FinOps | All BUs | Domains C, D, E, F | Incident and DLP case details |
| Internal Audit (read-only) | All BUs | Everything read-only, including calculation inputs and lineage | Write actions |

In the dashboard, the **Viewing as** selector demonstrates the BU CISO scope: the business-unit filter is locked to the role's BU and every KPI, breakdown and record is computed only from that BU's rows.

## 2. Enforcement layers

1. **Identity**: SSO through the enterprise IdP with MFA; group claims map to roles. No local accounts.
2. **API authorisation**: every request carries the user's role and scope; the API rejects scopes outside the user's grants.
3. **Row-level security** in the KPI store (see `05-database-schema.sql`): policies on every fact and record filter by `tenant_id` through `sec.can_see_tenant()`. Aggregates are computed **after** RLS, so a BU user can never infer another BU's numbers from totals.
4. **Column masking**: user identifiers in traces are pseudonymised (hashed) for all roles except DFIR under a case reference.
5. **Export controls**: exports inherit the user's scope and are watermarked with user, scope and timestamp; bulk record exports require the Group CISO or Audit role.

## 3. Multi-tenant isolation (MSSP / subsidiary model)

- Every fact and record carries `tenant_id`; cross-tenant joins are only possible inside group-level aggregate views.
- Shared-platform measures (GPU, Kubernetes, gateway availability) are visible to all tenants as platform metrics; their **costs** are allocated by usage share, so a tenant sees only its own allocation.
- Tenant-specific secrets, model keys and MCP registrations are separated; agent identities are tenant-scoped workload identities.
- Data residency: tenant data stays in the UAE region / on-prem; any non-UAE model endpoint requires an approved transfer mechanism (tracked by KPI 146).

## 4. Data classification

| Class | Examples | Handling |
|---|---|---|
| Restricted | Incident records, DLP cases, traces with resource names | RLS + masking, SOC / DFIR / Audit only |
| Confidential | Financial ledger, budgets, risk register | Finance, CISO, BU CISO (own BU), Audit |
| Internal | KPI values, thresholds, catalog | All dashboard roles within scope |
| Public | None | - |

## 5. Audit logging

All logins, scope changes, KPI drawer openings for restricted KPIs, record views and exports are logged to the SIEM with user, role, scope, query and timestamp. Access reviews are quarterly; break-glass access requires CISO approval and is time-bound.
