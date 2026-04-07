using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowInstanceRepository : IWorkflowInstanceRepository
{
    private readonly SqliteConnection _connection;

    public SqliteWorkflowInstanceRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task<WorkflowInstance?> GetAsync(
        string instanceId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            SELECT instance_id, workflow_id, workflow_version, version, current_status, context_json, last_evaluation_json, created_at, updated_at
            FROM workflow_instances
            WHERE instance_id = $instanceId;
            """;
        command.Parameters.AddWithValue("$instanceId", instanceId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadWorkflowInstance(reader);
    }

    public async Task<WorkflowInstance> SaveAsync(
        WorkflowInstance instance,
        int? expectedVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var sqliteTransaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);

        if (expectedVersion is null)
        {
            var createdInstance = instance with { Version = 1 };
            await using var insertCommand = _connection.CreateCommand();
            insertCommand.Transaction = sqliteTransaction;
            insertCommand.CommandText =
                """
                INSERT INTO workflow_instances (
                    instance_id,
                    workflow_id,
                    workflow_version,
                    version,
                    current_status,
                    context_json,
                    last_evaluation_json,
                    created_at,
                    updated_at)
                VALUES (
                    $instanceId,
                    $workflowId,
                    $workflowVersion,
                    $version,
                    $currentStatus,
                    $contextJson,
                    $lastEvaluationJson,
                    $createdAt,
                    $updatedAt);
                """;
            BindInstance(insertCommand, createdInstance);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
            return createdInstance;
        }

        var updatedInstance = instance with { Version = expectedVersion.Value + 1 };
        await using var updateCommand = _connection.CreateCommand();
        updateCommand.Transaction = sqliteTransaction;
        updateCommand.CommandText =
            """
            UPDATE workflow_instances
            SET
                workflow_id = $workflowId,
                workflow_version = $workflowVersion,
                version = $version,
                current_status = $currentStatus,
                context_json = $contextJson,
                last_evaluation_json = $lastEvaluationJson,
                updated_at = $updatedAt
            WHERE instance_id = $instanceId
              AND version = $expectedVersion;
            """;
        BindInstance(updateCommand, updatedInstance);
        updateCommand.Parameters.AddWithValue("$expectedVersion", expectedVersion.Value);

        if (await updateCommand.ExecuteNonQueryAsync(cancellationToken) == 0)
        {
            throw new OptimisticConcurrencyException(
                $"Workflow instance '{instance.Id}' could not be updated because the expected version {expectedVersion.Value} is stale.");
        }

        return updatedInstance;
    }

    public async Task<IReadOnlyList<WorkflowInstance>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT instance_id, workflow_id, workflow_version, version, current_status, context_json, last_evaluation_json, created_at, updated_at
            FROM workflow_instances
            ORDER BY updated_at DESC, instance_id;
            """;

        var instances = new List<WorkflowInstance>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            instances.Add(ReadWorkflowInstance(reader));
        }

        return instances;
    }

    public async Task DeleteByWorkflowIdAsync(
        string workflowId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            DELETE FROM workflow_instances
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> AnyForWorkflowVersionAsync(
        string workflowId,
        int workflowVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            SELECT 1
            FROM workflow_instances
            WHERE workflow_id = $workflowId
              AND workflow_version = $workflowVersion
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        command.Parameters.AddWithValue("$workflowVersion", workflowVersion);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    public async Task<bool> AnyForWorkflowVersionsNewerThanAsync(
        string workflowId,
        int workflowVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            SELECT 1
            FROM workflow_instances
            WHERE workflow_id = $workflowId
              AND workflow_version > $workflowVersion
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        command.Parameters.AddWithValue("$workflowVersion", workflowVersion);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    private static WorkflowInstance ReadWorkflowInstance(SqliteDataReader reader)
    {
        var lastEvaluation = reader.IsDBNull(6)
            ? null
            : SqliteJson.Deserialize<WorkflowEvaluationResult>(reader.GetString(6));

        return new WorkflowInstance(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetInt32(2),
            reader.GetInt32(3),
            reader.GetString(4),
            SqliteJson.Deserialize<Dictionary<string, string?>>(reader.GetString(5)),
            lastEvaluation,
            DateTimeOffset.Parse(reader.GetString(7)),
            DateTimeOffset.Parse(reader.GetString(8)));
    }

    private static void BindInstance(SqliteCommand command, WorkflowInstance instance)
    {
        command.Parameters.AddWithValue("$instanceId", instance.Id);
        command.Parameters.AddWithValue("$workflowId", instance.WorkflowId);
        command.Parameters.AddWithValue("$workflowVersion", instance.WorkflowVersion);
        command.Parameters.AddWithValue("$version", instance.Version);
        command.Parameters.AddWithValue("$currentStatus", instance.CurrentStatus);
        command.Parameters.AddWithValue("$contextJson", SqliteJson.Serialize(instance.Context));
        command.Parameters.AddWithValue(
            "$lastEvaluationJson",
            instance.LastEvaluation is null ? DBNull.Value : SqliteJson.Serialize(instance.LastEvaluation));
        command.Parameters.AddWithValue("$createdAt", instance.CreatedAt.ToString("O"));
        command.Parameters.AddWithValue("$updatedAt", instance.UpdatedAt.ToString("O"));
    }
}
