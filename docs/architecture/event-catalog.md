# Event Catalog

## Principles

- Events describe business facts that already committed.
- Event names are stable and past tense.
- Every event carries `eventId`, `occurredAt`, `correlationId`, `causationId`, `actorId`, `module`, and `schemaVersion`.
- Events are published from the outbox, never directly from UI code or domain handlers.

## Core Events

### Workflow

- `WorkflowDefinitionSaved`
- `WorkflowDefinitionRolledBack`
- `WorkflowCategorySaved`
- `WorkflowInstanceCreated`
- `WorkflowCommandExecuted`
- `WorkflowTaskCreated`
- `WorkflowTaskCompleted`

### Trading

- `OrderPlaced`
- `OrderValidated`
- `OrderRejected`
- `OrderRouted`
- `FillReceived`
- `TradeBooked`
- `TradeAmended`
- `TradeCancelled`
- `TradeAllocated`

### Positions and risk

- `PositionUpdated`
- `ValuationCalculated`
- `PreTradeRiskChecked`
- `RiskLimitBreached`
- `RiskLimitReleased`

### Operations and finance

- `ConfirmationGenerated`
- `SettlementInstructionGenerated`
- `SettlementStatusUpdated`
- `CashProjectionUpdated`
- `ReconciliationBreakOpened`
- `ReconciliationBreakResolved`
- `JournalPrepared`
- `JournalPosted`
- `GlExportGenerated`

### Security and governance

- `ObjectGrantChanged`
- `StepUpAuthenticationChallenged`
- `StepUpAuthenticationCompleted`
- `AgentActionRequested`
- `AgentActionApproved`
- `AgentActionExecuted`
- `AgentActionBlocked`

## Envelope Example

```json
{
  "eventId": "d0d4c6b49d6b4fb4aa9d5ab989f8b18b",
  "schemaVersion": 1,
  "eventType": "TradeBooked",
  "module": "Trades",
  "aggregateType": "Trade",
  "aggregateId": "trade-20260327-00124",
  "occurredAt": "2026-03-27T10:15:42.1234567Z",
  "correlationId": "req-8b9d0b7b56ef48aa8baf1d2f6b3a3434",
  "causationId": "fill-7f5f0fb8de734c62b83d5eb7b440d5fb",
  "actorId": "trader:jwoeste",
  "payload": {
    "bookId": "EQ-ARBITRAGE",
    "instrumentId": "AAPL.OQ",
    "quantity": 1000,
    "price": 192.44,
    "tradeDate": "2026-03-27"
  }
}
```

## Initial Event Ownership

- `Workflow` module publishes workflow and task events.
- `Orders` publishes order lifecycle events.
- `Execution` publishes normalized fill events.
- `Trades` publishes canonical trade lifecycle events.
- `Positions` publishes position and valuation events.
- `Risk` publishes decision and breach events.
- `Operations` publishes settlement and reconciliation events.
- `Ledger` publishes journal and GL export events.

## Ordering Guidance

- Preserve per-aggregate ordering, not global ordering.
- Use aggregate IDs as partition keys where consumers need deterministic sequencing.
- Never assume cross-module total order in consumers.

## Idempotency Guidance

- Consumers store processed inbox IDs.
- Handlers must tolerate duplicate delivery.
- Projection rebuilds should be possible from durable events plus relational state.
