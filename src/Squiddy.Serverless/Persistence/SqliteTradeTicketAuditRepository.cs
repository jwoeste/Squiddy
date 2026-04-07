using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteTradeTicketAuditRepository : ITradeTicketAuditRepository
{
    private readonly SqliteConnection _connection;

    public SqliteTradeTicketAuditRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task AppendAsync(
        TradeTicketAuditRecord auditRecord,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            INSERT INTO trade_ticket_audit (
                audit_id,
                ticket_id,
                trade_version,
                action_code,
                description,
                trigger_source,
                actor_id,
                correlation_id,
                metadata_json,
                snapshot_json,
                created_at)
            VALUES (
                $auditId,
                $ticketId,
                $tradeVersion,
                $actionCode,
                $description,
                $triggerSource,
                $actorId,
                $correlationId,
                $metadataJson,
                $snapshotJson,
                $createdAt);
            """;
        command.Parameters.AddWithValue("$auditId", auditRecord.AuditId);
        command.Parameters.AddWithValue("$ticketId", auditRecord.TicketId);
        command.Parameters.AddWithValue("$tradeVersion", auditRecord.TradeVersion);
        command.Parameters.AddWithValue("$actionCode", auditRecord.ActionCode);
        command.Parameters.AddWithValue("$description", (object?)auditRecord.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("$triggerSource", (object?)auditRecord.TriggerSource ?? DBNull.Value);
        command.Parameters.AddWithValue("$actorId", (object?)auditRecord.ActorId ?? DBNull.Value);
        command.Parameters.AddWithValue("$correlationId", (object?)auditRecord.CorrelationId ?? DBNull.Value);
        command.Parameters.AddWithValue("$metadataJson", SqliteJson.Serialize(auditRecord.Metadata));
        command.Parameters.AddWithValue("$snapshotJson", SqliteJson.Serialize(auditRecord.Snapshot));
        command.Parameters.AddWithValue("$createdAt", auditRecord.CreatedAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TradeTicketAuditRecord>> ListByTicketIdAsync(
        string ticketId,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT
                audit_id,
                ticket_id,
                trade_version,
                action_code,
                description,
                trigger_source,
                actor_id,
                correlation_id,
                metadata_json,
                snapshot_json,
                created_at
            FROM trade_ticket_audit
            WHERE ticket_id = $ticketId
            ORDER BY created_at DESC, audit_id DESC;
            """;
        command.Parameters.AddWithValue("$ticketId", ticketId);

        var records = new List<TradeTicketAuditRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            records.Add(new TradeTicketAuditRecord(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetInt32(2),
                reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7),
                SqliteJson.Deserialize<Dictionary<string, string?>>(reader.GetString(8)),
                reader.GetString(10),
                SqliteJson.Deserialize<TradeTicket>(reader.GetString(9))));
        }

        return records;
    }
}
