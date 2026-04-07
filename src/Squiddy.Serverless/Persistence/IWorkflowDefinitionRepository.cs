namespace Squiddy.Serverless.Persistence;

public interface IWorkflowDefinitionRepository
{
    Task<WorkflowDefinition> SaveAsync(
        WorkflowDefinition workflow,
        int? expectedVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<WorkflowDefinition?> GetAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<WorkflowDefinition?> GetVersionAsync(
        string workflowId,
        int? version,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WorkflowDefinition>> ListAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WorkflowVersionInfo>> ListVersionsAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task CanonicalizeAllAsync(CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task DeleteVersionsNewerThanAsync(
        string workflowId,
        int targetVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<int?> GetLatestVersionNumberAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
