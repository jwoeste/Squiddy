namespace Squiddy.Serverless.Persistence;

public interface IWorkflowInstanceRepository
{
    Task<WorkflowInstance?> GetAsync(
        string instanceId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<WorkflowInstance> SaveAsync(
        WorkflowInstance instance,
        int? expectedVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WorkflowInstance>> ListAsync(CancellationToken cancellationToken = default);

    Task DeleteByWorkflowIdAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<bool> AnyForWorkflowVersionAsync(
        string workflowId,
        int workflowVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<bool> AnyForWorkflowVersionsNewerThanAsync(
        string workflowId,
        int workflowVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
