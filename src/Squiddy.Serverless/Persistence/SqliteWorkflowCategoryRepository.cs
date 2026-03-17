using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowCategoryRepository
{
    private readonly SqliteConnection _connection;

    public SqliteWorkflowCategoryRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task<IReadOnlyList<WorkflowCategory>> ListAsync(
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT category_id, name, description, created_at, updated_at
            FROM workflow_categories
            ORDER BY name, category_id;
            """;

        var categories = new List<WorkflowCategory>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            categories.Add(ReadCategory(reader));
        }

        return categories;
    }

    public async Task<WorkflowCategory?> GetAsync(
        string categoryId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT category_id, name, description, created_at, updated_at
            FROM workflow_categories
            WHERE category_id = $categoryId
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$categoryId", categoryId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadCategory(reader);
    }

    public async Task<WorkflowCategory> SaveAsync(
        WorkflowCategory category,
        string? originalCategoryId = null,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = category with
        {
            Id = category.Id.Trim(),
            Name = category.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(category.Description) ? null : category.Description.Trim()
        };

        var effectiveOriginalId = string.IsNullOrWhiteSpace(originalCategoryId)
            ? normalized.Id
            : originalCategoryId.Trim();

        var existing = await GetAsync(effectiveOriginalId, transaction, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        if (existing is null)
        {
            var created = normalized with { CreatedAt = now, UpdatedAt = now };
            await InsertAsync(created, transaction, cancellationToken);
            return created;
        }

        if (!string.Equals(effectiveOriginalId, normalized.Id, StringComparison.OrdinalIgnoreCase))
        {
            var conflicting = await GetAsync(normalized.Id, transaction, cancellationToken);
            if (conflicting is not null)
            {
                throw new InvalidOperationException($"Workflow category '{normalized.Id}' already exists.");
            }
        }

        var updated = normalized with
        {
            CreatedAt = existing.CreatedAt,
            UpdatedAt = now
        };

        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            UPDATE workflow_categories
            SET
                category_id = $categoryId,
                name = $name,
                description = $description,
                updated_at = $updatedAt
            WHERE category_id = $originalCategoryId;
            """;
        command.Parameters.AddWithValue("$categoryId", updated.Id);
        command.Parameters.AddWithValue("$name", updated.Name);
        command.Parameters.AddWithValue("$description", (object?)updated.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("$updatedAt", updated.UpdatedAt.ToString("O"));
        command.Parameters.AddWithValue("$originalCategoryId", effectiveOriginalId);
        await command.ExecuteNonQueryAsync(cancellationToken);

        if (!string.Equals(effectiveOriginalId, updated.Id, StringComparison.OrdinalIgnoreCase))
        {
            var definitions = new List<(string WorkflowId, int Version, string DefinitionJson)>();
            await using var readDefinitionsCommand = _connection.CreateCommand();
            readDefinitionsCommand.Transaction = transaction;
            readDefinitionsCommand.CommandText =
                """
                SELECT workflow_id, version, definition_json
                FROM workflow_definitions
                WHERE category_id = $oldCategoryId;
                """;
            readDefinitionsCommand.Parameters.AddWithValue("$oldCategoryId", effectiveOriginalId);

            await using (var reader = await readDefinitionsCommand.ExecuteReaderAsync(cancellationToken))
            {
                while (await reader.ReadAsync(cancellationToken))
                {
                    definitions.Add((reader.GetString(0), reader.GetInt32(1), reader.GetString(2)));
                }
            }

            await using var workflowCommand = _connection.CreateCommand();
            workflowCommand.Transaction = transaction;
            workflowCommand.CommandText =
                """
                UPDATE workflow_definitions
                SET category_id = $newCategoryId
                WHERE category_id = $oldCategoryId;
                """;
            workflowCommand.Parameters.AddWithValue("$newCategoryId", updated.Id);
            workflowCommand.Parameters.AddWithValue("$oldCategoryId", effectiveOriginalId);
            await workflowCommand.ExecuteNonQueryAsync(cancellationToken);

            foreach (var definition in definitions)
            {
                var workflow = SqliteJson.Deserialize<WorkflowDefinition>(definition.DefinitionJson) with
                {
                    CategoryId = updated.Id
                };

                await using var updateDefinitionCommand = _connection.CreateCommand();
                updateDefinitionCommand.Transaction = transaction;
                updateDefinitionCommand.CommandText =
                    """
                    UPDATE workflow_definitions
                    SET definition_json = $definitionJson
                    WHERE workflow_id = $workflowId
                      AND version = $version;
                    """;
                updateDefinitionCommand.Parameters.AddWithValue("$workflowId", definition.WorkflowId);
                updateDefinitionCommand.Parameters.AddWithValue("$version", definition.Version);
                updateDefinitionCommand.Parameters.AddWithValue("$definitionJson", SqliteJson.Serialize(workflow));
                await updateDefinitionCommand.ExecuteNonQueryAsync(cancellationToken);
            }
        }

        return updated;
    }

    public async Task DeleteAsync(
        string categoryId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            DELETE FROM workflow_categories
            WHERE category_id = $categoryId;
            """;
        command.Parameters.AddWithValue("$categoryId", categoryId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int> CountWorkflowDefinitionsAsync(
        string categoryId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            SELECT COUNT(*)
            FROM workflow_definitions
            WHERE category_id = $categoryId;
            """;
        command.Parameters.AddWithValue("$categoryId", categoryId);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private async Task InsertAsync(
        WorkflowCategory category,
        SqliteTransaction? transaction,
        CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO workflow_categories (category_id, name, description, created_at, updated_at)
            VALUES ($categoryId, $name, $description, $createdAt, $updatedAt);
            """;
        command.Parameters.AddWithValue("$categoryId", category.Id);
        command.Parameters.AddWithValue("$name", category.Name);
        command.Parameters.AddWithValue("$description", (object?)category.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("$createdAt", category.CreatedAt.ToString("O"));
        command.Parameters.AddWithValue("$updatedAt", category.UpdatedAt.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static WorkflowCategory ReadCategory(SqliteDataReader reader) =>
        new(
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            DateTimeOffset.Parse(reader.GetString(3)),
            DateTimeOffset.Parse(reader.GetString(4)));
}
