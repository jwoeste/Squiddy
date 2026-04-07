# Schema Ownership

## Position

Keep SQLite for now, but organize the write model as if each module already owned a relational schema. That makes the later move to PostgreSQL mostly a physical migration rather than an application rewrite.

## Logical Schema Map

### `identity_access`

- `users`
- `groups`
- `roles`
- `group_memberships`
- `role_assignments`
- `object_grants`
- `auth_challenges`
- `agent_principals`

### `reference_data`

- `instruments`
- `counterparties`
- `books`
- `legal_entities`
- `settlement_instructions`
- `market_calendars`

### `workflow`

- `workflow_categories`
- `workflow_definitions`
- `workflow_instances`
- `workflow_audit_transactions`
- `workflow_audit_entries`
- `workflow_tasks`

### `orders`

- `orders`
- `order_events`
- `routing_requests`

### `execution`

- `execution_adapters`
- `fills`
- `execution_events`

### `trades`

- `trades`
- `trade_versions`
- `trade_allocations`
- `trade_lifecycle_events`

### `positions`

- `position_lots`
- `position_snapshots`
- `valuation_snapshots`

### `risk`

- `risk_checks`
- `risk_limits`
- `risk_breaches`
- `exposure_snapshots`

### `operations`

- `confirmations`
- `settlement_instructions`
- `settlement_status_history`
- `reconciliation_breaks`

### `ledger`

- `journal_batches`
- `journal_entries`
- `accounting_periods`
- `gl_exports`

### `platform`

- `outbox_messages`
- `inbox_messages`
- `audit_log`
- `idempotency_keys`

## Rules

- One module owns writes to its own tables.
- Other modules integrate through APIs, commands, or published events.
- Cross-module joins are acceptable in projections and reporting, not in write-side ownership.
- Audit and outbox records may be centralized in `platform`, but they must still capture module ownership metadata.

## SQLite-Now Guidance

- Keep current table names stable where they already exist.
- Add a naming convention in code and docs so the future PostgreSQL schemas are obvious.
- Avoid baking SQLite-specific behavior into application services.
- Prefer repository methods shaped around domain operations, not SQL-specific mechanics.

## PostgreSQL-Later Guidance

- Map each logical schema above to a PostgreSQL schema.
- Give each module its own EF Core `DbContext` or equivalent write model boundary.
- Keep migrations module-scoped.
- Move reporting and search reads into separate projection stores rather than overloading the transactional database.
