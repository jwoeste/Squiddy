using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowInstanceRepository
{
    private readonly SqliteConnection _connection;

    public SqliteWorkflowInstanceRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task<WorkflowInstance?> GetAsync(
        string instanceId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT instance_id, workflow_id, current_status, context_json, last_evaluation_json, created_at, updated_at
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

    public async Task UpsertAsync(
        WorkflowInstance instance,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO workflow_instances (
                instance_id,
                workflow_id,
                current_status,
                context_json,
                last_evaluation_json,
                created_at,
                updated_at)
            VALUES (
                $instanceId,
                $workflowId,
                $currentStatus,
                $contextJson,
                $lastEvaluationJson,
                $createdAt,
                $updatedAt)
            ON CONFLICT(instance_id) DO UPDATE SET
                workflow_id = excluded.workflow_id,
                current_status = excluded.current_status,
                context_json = excluded.context_json,
                last_evaluation_json = excluded.last_evaluation_json,
                updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$instanceId", instance.Id);
        command.Parameters.AddWithValue("$workflowId", instance.WorkflowId);
        command.Parameters.AddWithValue("$currentStatus", instance.CurrentStatus);
        command.Parameters.AddWithValue("$contextJson", SqliteJson.Serialize(instance.Context));
        command.Parameters.AddWithValue(
            "$lastEvaluationJson",
            instance.LastEvaluation is null ? DBNull.Value : SqliteJson.Serialize(instance.LastEvaluation));
        command.Parameters.AddWithValue("$createdAt", instance.CreatedAt.ToString("O"));
        command.Parameters.AddWithValue("$updatedAt", instance.UpdatedAt.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<WorkflowInstance>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT instance_id, workflow_id, current_status, context_json, last_evaluation_json, created_at, updated_at
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
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            DELETE FROM workflow_instances
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static WorkflowInstance ReadWorkflowInstance(SqliteDataReader reader)
    {
        var lastEvaluation = reader.IsDBNull(4)
            ? null
            : SqliteJson.Deserialize<WorkflowEvaluationResult>(reader.GetString(4));

        return new WorkflowInstance(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            SqliteJson.Deserialize<Dictionary<string, string?>>(reader.GetString(3)),
            lastEvaluation,
            DateTimeOffset.Parse(reader.GetString(5)),
            DateTimeOffset.Parse(reader.GetString(6)));
    }
}
