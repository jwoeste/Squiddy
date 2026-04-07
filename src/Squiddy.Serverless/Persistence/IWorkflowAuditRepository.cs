namespace Squiddy.Serverless.Persistence;

public interface IWorkflowAuditRepository
{
    Task AppendTransactionAsync(
        WorkflowAuditTransaction transactionRecord,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WorkflowAuditTransaction>> ListByInstanceAsync(
        string instanceId,
        CancellationToken cancellationToken = default);

    Task DeleteByWorkflowIdAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
