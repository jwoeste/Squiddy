namespace Squiddy.Serverless;

public sealed record TradeTicket(
    string TicketId,
    int Version,
    string Status,
    string TradeType,
    string AssetClass,
    string ProductType,
    string Instrument,
    string Side,
    double Quantity,
    double Price,
    string Currency,
    string TradeDate,
    string SettleDate,
    string Book,
    string Strategy,
    string Trader,
    string Counterparty,
    string Venue,
    string Broker,
    string SettlementInstruction,
    string Notes,
    string SettlementLocation,
    string CashAccount,
    string SettlementComments,
    string? ExceptionState,
    string WorkflowId,
    string? WorkflowInstanceId,
    int WorkflowVersion,
    int WorkflowInstanceVersion,
    IReadOnlyList<TradeTicketCheck> Checks,
    IReadOnlyList<TradeTicketAllocation> Allocations,
    IReadOnlyList<TradeTicketActivity> Activity,
    string CreatedAt,
    string UpdatedAt);

public sealed record TradeTicketCheck(
    string Id,
    string Label,
    string Description,
    bool Passed);

public sealed record TradeTicketAllocation(
    string Id,
    string Account,
    string Book,
    double Quantity);

public sealed record TradeTicketActivity(
    string Message,
    string Actor,
    string Timestamp);
