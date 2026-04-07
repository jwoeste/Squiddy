namespace Squiddy.Serverless.Contracts;

public sealed record SaveTradeTicketRequest(
    TradeTicket Trade,
    int? ExpectedVersion = null,
    string ActionCode = "TRADE_SAVED",
    string? Description = null,
    string? TriggerSource = null,
    string? ActorId = null,
    string? CorrelationId = null,
    Dictionary<string, string?>? Metadata = null);
