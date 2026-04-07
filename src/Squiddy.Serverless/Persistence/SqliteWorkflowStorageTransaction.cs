using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowStorageTransaction : IWorkflowStorageTransaction
{
    internal SqliteWorkflowStorageTransaction(SqliteTransaction transaction)
    {
        Transaction = transaction;
    }

    internal SqliteTransaction Transaction { get; }

    public Task CommitAsync(CancellationToken cancellationToken = default) =>
        Transaction.CommitAsync(cancellationToken);

    public ValueTask DisposeAsync() => Transaction.DisposeAsync();

    internal static SqliteTransaction? Unwrap(IWorkflowStorageTransaction? transaction) =>
        transaction switch
        {
            null => null,
            SqliteWorkflowStorageTransaction sqliteTransaction => sqliteTransaction.Transaction,
            _ => throw new InvalidOperationException(
                $"Unsupported transaction type '{transaction.GetType().Name}' for the SQLite storage backend.")
        };
}
