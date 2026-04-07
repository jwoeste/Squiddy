namespace Squiddy.Serverless.Persistence;

public interface IWorkflowStorageBackendFactory
{
    Task<IWorkflowStorageBackend> CreateAsync(CancellationToken cancellationToken = default);
}
