using System.Data;
using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowDefinitionRepository
{
    private readonly SqliteConnection _connection;

    public SqliteWorkflowDefinitionRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task UpsertAsync(
        WorkflowDefinition workflow,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;

        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO workflow_definitions (workflow_id, name, definition_json, created_at, updated_at)
            VALUES ($workflowId, $name, $definitionJson, $createdAt, $updatedAt)
            ON CONFLICT(workflow_id) DO UPDATE SET
                name = excluded.name,
                definition_json = excluded.definition_json,
                updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$workflowId", workflow.Id);
        command.Parameters.AddWithValue("$name", workflow.Name);
        command.Parameters.AddWithValue(
            "$definitionJson",
            SqliteJson.Serialize(workflow with { Statuses = workflow.Statuses ?? Array.Empty<WorkflowStatus>() }));
        command.Parameters.AddWithValue("$createdAt", now.ToString("O"));
        command.Parameters.AddWithValue("$updatedAt", now.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<WorkflowDefinition?> GetAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT definition_json
            FROM workflow_definitions
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is not string json)
        {
            return null;
        }

        return SqliteJson.Deserialize<WorkflowDefinition>(json);
    }

    public async Task<IReadOnlyList<WorkflowDefinition>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT definition_json
            FROM workflow_definitions
            ORDER BY workflow_id;
            """;

        var workflows = new List<WorkflowDefinition>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            workflows.Add(SqliteJson.Deserialize<WorkflowDefinition>(reader.GetString(0)));
        }

        return workflows;
    }

    public async Task<bool> DeleteAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            DELETE FROM workflow_definitions
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);

        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }
}
