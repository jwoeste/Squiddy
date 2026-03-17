using System.Data;
using System.Text.Json;
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
            await InsertWorkflowVersionAsync(createdWorkflow, now, transaction, cancellationToken);
            return createdWorkflow;
        }

        if (expectedVersion != existingWorkflow.Version)
        {
            throw new OptimisticConcurrencyException(
                $"Workflow '{workflow.Id}' version mismatch. Expected {expectedVersion?.ToString() ?? "null"}, current version is {existingWorkflow.Version}.");
        }

        var updatedWorkflow = workflow with { Version = existingWorkflow.Version + 1 };
        await InsertWorkflowVersionAsync(updatedWorkflow, now, transaction, cancellationToken);
        return updatedWorkflow;
    }

    public async Task<WorkflowDefinition?> GetAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
        => await GetVersionAsync(workflowId, version: null, transaction, cancellationToken);

    public async Task<WorkflowDefinition?> GetVersionAsync(
        string workflowId,
        int? version,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = version is null
            ? """
              SELECT version, category_id, definition_json
              FROM workflow_definitions
              WHERE workflow_id = $workflowId
              ORDER BY version DESC
              LIMIT 1;
              """
            : """
              SELECT version, category_id, definition_json
              FROM workflow_definitions
              WHERE workflow_id = $workflowId
                AND version = $version
              LIMIT 1;
              """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        if (version is not null)
        {
            command.Parameters.AddWithValue("$version", version.Value);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return HydrateWorkflow(reader.GetInt32(0), reader.GetString(1), reader.GetString(2));
    }

    public async Task<IReadOnlyList<WorkflowDefinition>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT definition.version, definition.category_id, definition.definition_json
            FROM workflow_definitions definition
            INNER JOIN (
                SELECT workflow_id, MAX(version) AS version
                FROM workflow_definitions
                GROUP BY workflow_id
            ) latest
                ON latest.workflow_id = definition.workflow_id
               AND latest.version = definition.version
            ORDER BY definition.workflow_id;
            """;

        var workflows = new List<WorkflowDefinition>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            workflows.Add(HydrateWorkflow(reader.GetInt32(0), reader.GetString(1), reader.GetString(2)));
        }

        return workflows;
    }

    public async Task<IReadOnlyList<WorkflowVersionInfo>> ListVersionsAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var latestVersion = await GetLatestVersionNumberAsync(workflowId, transaction, cancellationToken);
        if (latestVersion is null)
        {
            return Array.Empty<WorkflowVersionInfo>();
        }

        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT
                definition.workflow_id,
                definition.version,
                definition.name,
                definition.created_at,
                definition.updated_at,
                COUNT(instance.instance_id) AS instance_count
            FROM workflow_definitions definition
            LEFT JOIN workflow_instances instance
                ON instance.workflow_id = definition.workflow_id
               AND instance.workflow_version = definition.version
            WHERE definition.workflow_id = $workflowId
            GROUP BY
                definition.workflow_id,
                definition.version,
                definition.name,
                definition.created_at,
                definition.updated_at
            ORDER BY definition.version DESC;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);

        var versions = new List<WorkflowVersionInfo>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            versions.Add(new WorkflowVersionInfo(
                reader.GetString(0),
                reader.GetInt32(1),
                reader.GetString(2),
                DateTimeOffset.Parse(reader.GetString(3)),
                DateTimeOffset.Parse(reader.GetString(4)),
                reader.GetInt32(5),
                reader.GetInt32(1) == latestVersion.Value));
        }

        return versions;
    }

    public async Task CanonicalizeAllAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT workflow_id, version, category_id, definition_json
            FROM workflow_definitions;
            """;

        var rows = new List<(string WorkflowId, int Version, string CategoryId, string DefinitionJson)>();
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add((reader.GetString(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3)));
        }

        foreach (var row in rows)
        {
            var hydrated = HydrateWorkflow(row.Version, row.CategoryId, row.DefinitionJson);

            await using var updateCommand = _connection.CreateCommand();
            updateCommand.CommandText =
                """
                UPDATE workflow_definitions
                SET
                    category_id = $categoryId,
                    name = $name,
                    definition_json = $definitionJson
                WHERE workflow_id = $workflowId
                  AND version = $version;
                """;
            updateCommand.Parameters.AddWithValue("$workflowId", row.WorkflowId);
            updateCommand.Parameters.AddWithValue("$categoryId", hydrated.CategoryId);
            updateCommand.Parameters.AddWithValue("$name", hydrated.Name);
            updateCommand.Parameters.AddWithValue("$version", hydrated.Version);
            updateCommand.Parameters.AddWithValue("$definitionJson", SqliteJson.Serialize(PrepareForStorage(hydrated)));
            await updateCommand.ExecuteNonQueryAsync(cancellationToken);
        }
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

    public async Task DeleteVersionsNewerThanAsync(
        string workflowId,
        int targetVersion,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            DELETE FROM workflow_definitions
            WHERE workflow_id = $workflowId
              AND version > $targetVersion;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);
        command.Parameters.AddWithValue("$targetVersion", targetVersion);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int?> GetLatestVersionNumberAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT MAX(version)
            FROM workflow_definitions
            WHERE workflow_id = $workflowId;
            """;
        command.Parameters.AddWithValue("$workflowId", workflowId);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : Convert.ToInt32(result);
    }

    private async Task InsertWorkflowVersionAsync(
        WorkflowDefinition workflow,
        DateTimeOffset now,
        SqliteTransaction? transaction,
        CancellationToken cancellationToken)
    {
        await using var insertCommand = _connection.CreateCommand();
        insertCommand.Transaction = transaction;
        insertCommand.CommandText =
            """
            INSERT INTO workflow_definitions (workflow_id, category_id, name, version, definition_json, created_at, updated_at)
            VALUES ($workflowId, $categoryId, $name, $version, $definitionJson, $createdAt, $updatedAt);
            """;
        insertCommand.Parameters.AddWithValue("$workflowId", workflow.Id);
        insertCommand.Parameters.AddWithValue("$categoryId", workflow.CategoryId);
        insertCommand.Parameters.AddWithValue("$name", workflow.Name);
        insertCommand.Parameters.AddWithValue("$version", workflow.Version);
        insertCommand.Parameters.AddWithValue("$definitionJson", SqliteJson.Serialize(PrepareForStorage(workflow)));
        insertCommand.Parameters.AddWithValue("$createdAt", now.ToString("O"));
        insertCommand.Parameters.AddWithValue("$updatedAt", now.ToString("O"));

        try
        {
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (SqliteException exception) when (exception.SqliteErrorCode == 19)
        {
            throw new OptimisticConcurrencyException(
                $"Workflow '{workflow.Id}' could not be updated because version {workflow.Version} already exists.");
        }
    }

    private static WorkflowDefinition HydrateWorkflow(int storedVersion, string storedCategoryId, string json)
    {
        var workflow = SqliteJson.Deserialize<WorkflowDefinition>(json);
        using var document = JsonDocument.Parse(json);
        var legacyStatuses = document.RootElement.TryGetProperty("statuses", out var statusesElement) &&
                             statusesElement.ValueKind == JsonValueKind.Array
            ? statusesElement.EnumerateArray().ToArray()
            : Array.Empty<JsonElement>();

        return workflow with
        {
            // Category moved from JSON-only metadata to an explicit row column. We prefer the JSON
            // value when present, but older rows rely on the backfilled column value instead.
            Version = workflow.Version > 0 ? workflow.Version : storedVersion,
            CategoryId = string.IsNullOrWhiteSpace(workflow.CategoryId)
                ? (string.IsNullOrWhiteSpace(storedCategoryId) ? "general" : storedCategoryId)
                : workflow.CategoryId,
            InitialStatus = string.IsNullOrWhiteSpace(workflow.InitialStatus)
                ? workflow.Statuses?.FirstOrDefault()?.Code ?? string.Empty
                : workflow.InitialStatus,
            Statuses = (workflow.Statuses ?? Array.Empty<WorkflowStatus>())
                .Select((status, statusIndex) =>
                {
                    var legacyStatus = statusIndex < legacyStatuses.Length ? legacyStatuses[statusIndex] : default;
                    var legacyActions = legacyStatus.ValueKind == JsonValueKind.Object &&
                                        legacyStatus.TryGetProperty("actions", out var actionsElement) &&
                                        actionsElement.ValueKind == JsonValueKind.Array
                        ? actionsElement.EnumerateArray().ToArray()
                        : Array.Empty<JsonElement>();

                    return status with
                    {
                        IsTerminal = status.IsTerminal || (status.Actions?.Count ?? 0) == 0,
                        Actions = (status.Actions ?? Array.Empty<WorkflowAction>())
                            .Select((action, actionIndex) =>
                            {
                                var legacyAction = actionIndex < legacyActions.Length ? legacyActions[actionIndex] : default;
                                return action with
                                {
                                    Mode = ReadLegacyActionMode(action.Mode, legacyAction)
                                };
                            })
                            .ToArray()
                    };
                })
                .ToArray()
        };
    }

    private static WorkflowActionMode ReadLegacyActionMode(WorkflowActionMode mode, JsonElement legacyAction)
    {
        if (mode != default || legacyAction.ValueKind != JsonValueKind.Object)
        {
            return mode;
        }

        if (legacyAction.TryGetProperty("isStraightThroughProcessing", out var stpElement) &&
            stpElement.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            return stpElement.GetBoolean() ? WorkflowActionMode.Automatic : WorkflowActionMode.Manual;
        }

        return mode;
    }

    private static WorkflowDefinition PrepareForStorage(WorkflowDefinition workflow) =>
        workflow with
        {
            CategoryId = string.IsNullOrWhiteSpace(workflow.CategoryId) ? "general" : workflow.CategoryId.Trim(),
            Statuses = workflow.Statuses ?? Array.Empty<WorkflowStatus>()
        };
}
