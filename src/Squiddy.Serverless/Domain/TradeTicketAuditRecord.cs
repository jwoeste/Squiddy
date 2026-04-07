namespace Squiddy.Serverless;

public sealed record TradeTicketAuditRecord(
    string AuditId,
    string TicketId,
    int TradeVersion,
    string ActionCode,
    string? Description,
    string? TriggerSource,
    string? ActorId,
    string? CorrelationId,
    IReadOnlyDictionary<string, string?> Metadata,
    string CreatedAt,
    TradeTicket Snapshot);
