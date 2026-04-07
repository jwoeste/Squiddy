using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowStorageBackend : IWorkflowStorageBackend
{
    private readonly SqliteConnection _connection;
    private readonly SqliteOptions _options;

    public SqliteWorkflowStorageBackend(SqliteConnection connection, SqliteOptions options)
    {
        _connection = connection;
        _options = options;
        WorkflowDefinitions = new SqliteWorkflowDefinitionRepository(connection);
        WorkflowInstances = new SqliteWorkflowInstanceRepository(connection);
        WorkflowAudits = new SqliteWorkflowAuditRepository(connection);
        WorkflowCategories = new SqliteWorkflowCategoryRepository(connection);
        TradeTickets = new SqliteTradeTicketRepository(connection);
        TradeTicketAudits = new SqliteTradeTicketAuditRepository(connection);
    }

    public IWorkflowDefinitionRepository WorkflowDefinitions { get; }

    public IWorkflowInstanceRepository WorkflowInstances { get; }

    public IWorkflowAuditRepository WorkflowAudits { get; }

    public IWorkflowCategoryRepository WorkflowCategories { get; }

    public ITradeTicketRepository TradeTickets { get; }

    public ITradeTicketAuditRepository TradeTicketAudits { get; }

    public async Task<IWorkflowStorageTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default)
    {
        var transaction = (SqliteTransaction)await _connection.BeginTransactionAsync(cancellationToken);
        return new SqliteWorkflowStorageTransaction(transaction);
    }

    public async Task<WorkflowStorageDiagnostics> GetDiagnosticsAsync(CancellationToken cancellationToken = default)
    {
        async Task<IReadOnlyList<string>> ReadColumnsAsync(string tableName)
        {
            await using var command = _connection.CreateCommand();
            command.CommandText = $"PRAGMA table_info({tableName});";

            var columns = new List<string>();
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                columns.Add(reader.GetString(1));
            }

            return columns;
        }

        async Task<int> ReadCountAsync(string tableName)
        {
            await using var command = _connection.CreateCommand();
            command.CommandText = $"SELECT COUNT(*) FROM {tableName};";
            return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        }

        var tables = new[]
        {
            new WorkflowStorageTableDiagnostics(
                "workflow_definitions",
                await ReadColumnsAsync("workflow_definitions"),
                await ReadCountAsync("workflow_definitions")),
            new WorkflowStorageTableDiagnostics(
                "workflow_categories",
                await ReadColumnsAsync("workflow_categories"),
                await ReadCountAsync("workflow_categories")),
            new WorkflowStorageTableDiagnostics(
                "workflow_instances",
                await ReadColumnsAsync("workflow_instances"),
                await ReadCountAsync("workflow_instances")),
            new WorkflowStorageTableDiagnostics(
                "trade_tickets",
                await ReadColumnsAsync("trade_tickets"),
                await ReadCountAsync("trade_tickets")),
            new WorkflowStorageTableDiagnostics(
                "trade_ticket_audit",
                await ReadColumnsAsync("trade_ticket_audit"),
                await ReadCountAsync("trade_ticket_audit"))
        };

        return new WorkflowStorageDiagnostics(
            "sqlite",
            _options.DatabasePath,
            Directory.GetCurrentDirectory(),
            tables);
    }

    public ValueTask DisposeAsync() => _connection.DisposeAsync();
}
