namespace Squiddy.Serverless.Persistence;

public interface IWorkflowStorageBackend : IAsyncDisposable
{
    IWorkflowDefinitionRepository WorkflowDefinitions { get; }

    IWorkflowInstanceRepository WorkflowInstances { get; }

    IWorkflowAuditRepository WorkflowAudits { get; }

    IWorkflowCategoryRepository WorkflowCategories { get; }

    ITradeTicketRepository TradeTickets { get; }

    ITradeTicketAuditRepository TradeTicketAudits { get; }

    Task<IWorkflowStorageTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);

    Task<WorkflowStorageDiagnostics> GetDiagnosticsAsync(CancellationToken cancellationToken = default);
}
