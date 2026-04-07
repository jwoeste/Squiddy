namespace Squiddy.Serverless.Persistence;

public interface ITradeTicketAuditRepository
{
    Task AppendAsync(
        TradeTicketAuditRecord auditRecord,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TradeTicketAuditRecord>> ListByTicketIdAsync(
        string ticketId,
        CancellationToken cancellationToken = default);
}
