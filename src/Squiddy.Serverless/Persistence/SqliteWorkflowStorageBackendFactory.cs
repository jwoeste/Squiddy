namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowStorageBackendFactory : IWorkflowStorageBackendFactory
{
    private readonly SqliteConnectionFactory _connectionFactory;
    private readonly SqliteOptions _options;

    public SqliteWorkflowStorageBackendFactory(SqliteConnectionFactory connectionFactory, SqliteOptions options)
    {
        _connectionFactory = connectionFactory;
        _options = options;
    }

    public async Task<IWorkflowStorageBackend> CreateAsync(CancellationToken cancellationToken = default)
    {
        var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        return new SqliteWorkflowStorageBackend(connection, _options);
    }
}
