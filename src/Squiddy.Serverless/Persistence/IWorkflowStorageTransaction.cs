namespace Squiddy.Serverless.Persistence;

public interface IWorkflowStorageTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken = default);
}
