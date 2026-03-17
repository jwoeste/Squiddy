using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteWorkflowAuditRepository
{
    private readonly SqliteConnection _connection;

    public SqliteWorkflowAuditRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task AppendTransactionAsync(
        WorkflowAuditTransaction transactionRecord,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var transactionCommand = _connection.CreateCommand();
        transactionCommand.Transaction = transaction;
        transactionCommand.CommandText =
            """
            INSERT INTO workflow_audit_transactions (
                transaction_id,
                instance_id,
                workflow_id,
                workflow_version,
                trigger_source,
                actor_id,
                correlation_id,
                starting_status,
                final_status,
                context_json,
                evaluation_json,
                created_at)
            VALUES (
                $transactionId,
                $instanceId,
                $workflowId,
                $workflowVersion,
                $triggerSource,
                $actorId,
                $correlationId,
                $startingStatus,
                $finalStatus,
                $contextJson,
                $evaluationJson,
                $createdAt);
            """;
        transactionCommand.Parameters.AddWithValue("$transactionId", transactionRecord.TransactionId);
        transactionCommand.Parameters.AddWithValue("$instanceId", transactionRecord.InstanceId);
        transactionCommand.Parameters.AddWithValue("$workflowId", transactionRecord.WorkflowId);
        transactionCommand.Parameters.AddWithValue("$workflowVersion", transactionRecord.WorkflowVersion);
        transactionCommand.Parameters.AddWithValue("$triggerSource", transactionRecord.TriggerSource);
        transactionCommand.Parameters.AddWithValue("$actorId", (object?)transactionRecord.ActorId ?? DBNull.Value);
        transactionCommand.Parameters.AddWithValue("$correlationId", (object?)transactionRecord.CorrelationId ?? DBNull.Value);
        transactionCommand.Parameters.AddWithValue("$startingStatus", transactionRecord.StartingStatus);
        transactionCommand.Parameters.AddWithValue("$finalStatus", transactionRecord.FinalStatus);
        transactionCommand.Parameters.AddWithValue("$contextJson", SqliteJson.Serialize(transactionRecord.ContextSnapshot));
        transactionCommand.Parameters.AddWithValue("$evaluationJson", SqliteJson.Serialize(transactionRecord.Evaluation));
        transactionCommand.Parameters.AddWithValue("$createdAt", transactionRecord.CreatedAt.ToString("O"));
        await transactionCommand.ExecuteNonQueryAsync(cancellationToken);

        foreach (var entry in transactionRecord.Entries)
        {
            await using var entryCommand = _connection.CreateCommand();
            entryCommand.Transaction = transaction;
            entryCommand.CommandText =
                """
                INSERT INTO workflow_audit_entries (
                    entry_id,
                    transaction_id,
                    sequence,
                    action_code,
                    from_status,
                    to_status,
                    applied_automatically,
                    created_at)
                VALUES (
                    $entryId,
                    $transactionId,
                    $sequence,
                    $actionCode,
                    $fromStatus,
                    $toStatus,
                    $appliedAutomatically,
                    $createdAt);
                """;
            entryCommand.Parameters.AddWithValue("$entryId", entry.EntryId);
            entryCommand.Parameters.AddWithValue("$transactionId", entry.TransactionId);
            entryCommand.Parameters.AddWithValue("$sequence", entry.Sequence);
            entryCommand.Parameters.AddWithValue("$actionCode", entry.ActionCode);
            entryCommand.Parameters.AddWithValue("$fromStatus", entry.FromStatus);
            entryCommand.Parameters.AddWithValue("$toStatus", entry.ToStatus);
            entryCommand.Parameters.AddWithValue("$appliedAutomatically", entry.AppliedAutomatically ? 1 : 0);
            entryCommand.Parameters.AddWithValue("$createdAt", entry.CreatedAt.ToString("O"));
            await entryCommand.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    public async Task<IReadOnlyList<WorkflowAuditTransaction>> ListByInstanceAsync(
        string instanceId,
        CancellationToken cancellationToken = default)
    {
        await using var transactionCommand = _connection.CreateCommand();
        transactionCommand.CommandText =
            """
            SELECT
                transaction_id,
                instance_id,
                workflow_id,
                workflow_version,
                trigger_source,
                actor_id,
                correlation_id,
                starting_status,
                final_status,
                context_json,
                evaluation_json,
                created_at
            FROM workflow_audit_transactions
            WHERE instance_id = $instanceId
            ORDER BY created_at DESC, transaction_id DESC;
            """;
        transactionCommand.Parameters.AddWithValue("$instanceId", instanceId);

        var transactions = new List<WorkflowAuditTransaction>();
        await using var reader = await transactionCommand.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var transactionId = reader.GetString(0);
            transactions.Add(new WorkflowAuditTransaction(
                transactionId,
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3),
                reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.GetString(7),
                reader.GetString(8),
                SqliteJson.Deserialize<Dictionary<string, string?>>(reader.GetString(9)),
                SqliteJson.Deserialize<WorkflowEvaluationResult>(reader.GetString(10)),
                DateTimeOffset.Parse(reader.GetString(11)),
                Array.Empty<WorkflowAuditEntry>()));
        }

        if (transactions.Count == 0)
        {
            return transactions;
        }

        var entriesByTransactionId = await ListEntriesByTransactionIdsAsync(
            transactions.Select(transactionRecord => transactionRecord.TransactionId).ToArray(),
            cancellationToken);

        return transactions
            .Select(transactionRecord => transactionRecord with
            {
                Entries = entriesByTransactionId.TryGetValue(transactionRecord.TransactionId, out var entries)
                    ? entries
                    : Array.Empty<WorkflowAuditEntry>()
            })
            .ToArray();
    }

    private async Task<IReadOnlyDictionary<string, IReadOnlyList<WorkflowAuditEntry>>> ListEntriesByTransactionIdsAsync(
        IReadOnlyList<string> transactionIds,
        CancellationToken cancellationToken)
    {
        var parameterNames = transactionIds
            .Select((_, index) => $"$transactionId{index}")
            .ToArray();

        await using var command = _connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT
                entry_id,
                transaction_id,
                sequence,
                action_code,
                from_status,
                to_status,
                applied_automatically,
                created_at
            FROM workflow_audit_entries
            WHERE transaction_id IN ({string.Join(", ", parameterNames)})
            ORDER BY transaction_id, sequence;
            """;

        for (var index = 0; index < transactionIds.Count; index++)
        {
            command.Parameters.AddWithValue(parameterNames[index], transactionIds[index]);
        }

        var entriesByTransactionId = new Dictionary<string, List<WorkflowAuditEntry>>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var entry = new WorkflowAuditEntry(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetInt32(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetBoolean(6),
                DateTimeOffset.Parse(reader.GetString(7)));

            if (!entriesByTransactionId.TryGetValue(entry.TransactionId, out var entries))
            {
                entries = new List<WorkflowAuditEntry>();
                entriesByTransactionId[entry.TransactionId] = entries;
            }

            entries.Add(entry);
        }

        return entriesByTransactionId.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<WorkflowAuditEntry>)pair.Value);
    }

    public async Task DeleteByWorkflowIdAsync(
        string workflowId,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var deleteEntriesCommand = _connection.CreateCommand();
        deleteEntriesCommand.Transaction = transaction;
        deleteEntriesCommand.CommandText =
            """
            DELETE FROM workflow_audit_entries
            WHERE transaction_id IN (
                SELECT transaction_id
                FROM workflow_audit_transactions
                WHERE workflow_id = $workflowId
            );
            """;
        deleteEntriesCommand.Parameters.AddWithValue("$workflowId", workflowId);
        await deleteEntriesCommand.ExecuteNonQueryAsync(cancellationToken);

        await using var deleteTransactionsCommand = _connection.CreateCommand();
        deleteTransactionsCommand.Transaction = transaction;
        deleteTransactionsCommand.CommandText =
            """
            DELETE FROM workflow_audit_transactions
            WHERE workflow_id = $workflowId;
            """;
        deleteTransactionsCommand.Parameters.AddWithValue("$workflowId", workflowId);
        await deleteTransactionsCommand.ExecuteNonQueryAsync(cancellationToken);
    }
}
