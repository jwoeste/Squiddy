using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteDatabaseInitializer
{
    private readonly SqliteConnectionFactory _connectionFactory;

    public SqliteDatabaseInitializer(SqliteConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task InitializeAsync(WorkflowDefinition seedWorkflow, CancellationToken cancellationToken = default)
    {
        await using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        foreach (var statement in SchemaStatements)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = statement;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await EnsureColumnAsync(connection, "workflow_definitions", "version", "INTEGER NOT NULL DEFAULT 1", cancellationToken);
        await EnsureColumnAsync(connection, "workflow_instances", "version", "INTEGER NOT NULL DEFAULT 1", cancellationToken);

        var repository = new SqliteWorkflowDefinitionRepository(connection);
        if (await repository.GetAsync(seedWorkflow.Id, cancellationToken: cancellationToken) is null)
        {
            await repository.SaveAsync(seedWorkflow, expectedVersion: null, cancellationToken: cancellationToken);
        }
    }

    private static readonly string[] SchemaStatements =
    {
        """
        CREATE TABLE IF NOT EXISTS workflow_definitions (
            workflow_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_instances (
            instance_id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            current_status TEXT NOT NULL,
            context_json TEXT NOT NULL,
            last_evaluation_json TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions (workflow_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_audit_transactions (
            transaction_id TEXT PRIMARY KEY,
            instance_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            trigger_source TEXT NOT NULL,
            actor_id TEXT NULL,
            correlation_id TEXT NULL,
            starting_status TEXT NOT NULL,
            final_status TEXT NOT NULL,
            context_json TEXT NOT NULL,
            evaluation_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES workflow_instances (instance_id),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions (workflow_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_audit_entries (
            entry_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            action_code TEXT NOT NULL,
            from_status TEXT NOT NULL,
            to_status TEXT NOT NULL,
            applied_automatically INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (transaction_id) REFERENCES workflow_audit_transactions (transaction_id)
        );
        """
    };

    private static async Task EnsureColumnAsync(
        SqliteConnection connection,
        string tableName,
        string columnName,
        string columnDefinition,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({tableName});";

        var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            existingColumns.Add(reader.GetString(1));
        }

        if (existingColumns.Contains(columnName))
        {
            return;
        }

        await using var alterCommand = connection.CreateCommand();
        alterCommand.CommandText = $"ALTER TABLE {tableName} ADD COLUMN {columnName} {columnDefinition};";
        await alterCommand.ExecuteNonQueryAsync(cancellationToken);
    }
}
