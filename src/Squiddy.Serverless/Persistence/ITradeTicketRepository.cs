namespace Squiddy.Serverless.Persistence;

public interface ITradeTicketRepository
{
    Task<TradeTicket?> GetAsync(
        string ticketId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TradeTicket>> ListAsync(CancellationToken cancellationToken = default);

    Task<TradeTicket> SaveAsync(
        TradeTicket trade,
        int? expectedVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
