namespace Squiddy.Serverless.Persistence;

public interface IWorkflowCategoryRepository
{
    Task<IReadOnlyList<WorkflowCategory>> ListAsync(CancellationToken cancellationToken = default);

    Task<WorkflowCategory?> GetAsync(
        string categoryId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<WorkflowCategory> SaveAsync(
        WorkflowCategory category,
        string? originalCategoryId = null,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        string categoryId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    Task<int> CountWorkflowDefinitionsAsync(
        string categoryId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
