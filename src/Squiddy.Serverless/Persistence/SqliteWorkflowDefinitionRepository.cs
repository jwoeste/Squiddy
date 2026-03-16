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

    public async Task<WorkflowDefinition> SaveAsync(
        WorkflowDefinition workflow,
        int? expectedVersion,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var existingWorkflow = await GetAsync(workflow.Id, transaction, cancellationToken);

        if (existingWorkflow is null)
        {
            if (expectedVersion is > 0)
            {
                throw new OptimisticConcurrencyException(
                    $"Workflow '{workflow.Id}' does not exist at version {expectedVersion.Value}.");
            }

            var createdWorkflow = workflow with { Version = 1 };
            await using var insertCommand = _connection.CreateCommand();
            insertCommand.Transaction = transaction;
            insertCommand.CommandText =
                """
                INSERT INTO workflow_definitions (workflow_id, name, version, definition_json, created_at, updated_at)
                VALUES ($workflowId, $name, $version, $definitionJson, $createdAt, $updatedAt);
                """;
            insertCommand.Parameters.AddWithValue("$workflowId", createdWorkflow.Id);
            insertCommand.Parameters.AddWithValue("$name", createdWorkflow.Name);
            insertCommand.Parameters.AddWithValue("$version", createdWorkflow.Version);
            insertCommand.Parameters.AddWithValue("$definitionJson", SqliteJson.Serialize(PrepareForStorage(createdWorkflow)));
            insertCommand.Parameters.AddWithValue("$createdAt", now.ToString("O"));
            insertCommand.Parameters.AddWithValue("$updatedAt", now.ToString("O"));
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
            return createdWorkflow;
        }

        if (expectedVersion != existingWorkflow.Version)
        {
            throw new OptimisticConcurrencyException(
                $"Workflow '{workflow.Id}' version mismatch. Expected {expectedVersion?.ToString() ?? "null"}, current version is {existingWorkflow.Version}.");
        }

        var updatedWorkflow = workflow with { Version = existingWorkflow.Version + 1 };
        await using var updateCommand = _connection.CreateCommand();
        updateCommand.Transaction = transaction;
        updateCommand.CommandText =
            """
            UPDATE workflow_definitions
            SET
                name = $name,
                version = $newVersion,
                definition_json = $definitionJson,
                updated_at = $updatedAt
            WHERE workflow_id = $workflowId
              AND version = $expectedVersion;
            """;
        updateCommand.Parameters.AddWithValue("$workflowId", updatedWorkflow.Id);
        updateCommand.Parameters.AddWithValue("$name", updatedWorkflow.Name);
        updateCommand.Parameters.AddWithValue("$newVersion", updatedWorkflow.Version);
        updateCommand.Parameters.AddWithValue("$definitionJson", SqliteJson.Serialize(PrepareForStorage(updatedWorkflow)));
        updateCommand.Parameters.AddWithValue("$updatedAt", now.ToString("O"));
        updateCommand.Parameters.AddWithValue("$expectedVersion", expectedVersion!.Value);

        if (await updateCommand.ExecuteNonQueryAsync(cancellationToken) == 0)
        {
            throw new OptimisticConcurrencyException(
                $"Workflow '{workflow.Id}' could not be updated because it changed concurrently.");
        }

        return updatedWorkflow;
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
            SELECT version, definition_json
            FROM workflow_definitions
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return HydrateWorkflow(reader.GetInt32(0), reader.GetString(1));
    }

    public async Task<IReadOnlyList<WorkflowDefinition>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT version, definition_json
            FROM workflow_definitions
            ORDER BY workflow_id;
            """;

        var workflows = new List<WorkflowDefinition>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            workflows.Add(HydrateWorkflow(reader.GetInt32(0), reader.GetString(1)));
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

    private static WorkflowDefinition HydrateWorkflow(int storedVersion, string json)
    {
        var workflow = SqliteJson.Deserialize<WorkflowDefinition>(json);
        return workflow with
        {
            Version = workflow.Version > 0 ? workflow.Version : storedVersion
        };
    }

    private static WorkflowDefinition PrepareForStorage(WorkflowDefinition workflow) =>
        workflow with
        {
            Statuses = workflow.Statuses ?? Array.Empty<WorkflowStatus>()
        };
}
