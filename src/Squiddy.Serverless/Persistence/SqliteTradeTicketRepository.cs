using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteTradeTicketRepository : ITradeTicketRepository
{
    private readonly SqliteConnection _connection;

    public SqliteTradeTicketRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public async Task<TradeTicket?> GetAsync(
        string ticketId,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        command.CommandText =
            """
            SELECT payload_json
            FROM trade_tickets
            WHERE ticket_id = $ticketId;
            """;
        command.Parameters.AddWithValue("$ticketId", ticketId);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is string payloadJson
            ? SqliteJson.Deserialize<TradeTicket>(payloadJson)
            : null;
    }

    public async Task<IReadOnlyList<TradeTicket>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText =
            """
            SELECT payload_json
            FROM trade_tickets
            ORDER BY updated_at DESC, ticket_id;
            """;

        var trades = new List<TradeTicket>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            trades.Add(SqliteJson.Deserialize<TradeTicket>(reader.GetString(0)));
        }

        return trades;
    }

    public async Task<TradeTicket> SaveAsync(
        TradeTicket trade,
        int? expectedVersion,
        IWorkflowStorageTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        var sqliteTransaction = SqliteWorkflowStorageTransaction.Unwrap(transaction);
        var existing = await GetAsync(trade.TicketId, transaction, cancellationToken);

        if (expectedVersion is null && existing is not null)
        {
            expectedVersion = existing.Version;
        }

        if (expectedVersion is null)
        {
            var createdTrade = trade with { Version = 1 };
            await using var insertCommand = _connection.CreateCommand();
            insertCommand.Transaction = sqliteTransaction;
            insertCommand.CommandText =
                """
                INSERT INTO trade_tickets (
                    ticket_id,
                    version,
                    status,
                    trade_type,
                    asset_class,
                    product_type,
                    instrument,
                    side,
                    quantity,
                    price,
                    currency,
                    book,
                    trader,
                    counterparty,
                    workflow_id,
                    workflow_instance_id,
                    workflow_version,
                    workflow_instance_version,
                    created_at,
                    updated_at,
                    payload_json)
                VALUES (
                    $ticketId,
                    $version,
                    $status,
                    $tradeType,
                    $assetClass,
                    $productType,
                    $instrument,
                    $side,
                    $quantity,
                    $price,
                    $currency,
                    $book,
                    $trader,
                    $counterparty,
                    $workflowId,
                    $workflowInstanceId,
                    $workflowVersion,
                    $workflowInstanceVersion,
                    $createdAt,
                    $updatedAt,
                    $payloadJson);
                """;
            BindTrade(insertCommand, createdTrade);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
            return createdTrade;
        }

        if (existing is null)
        {
            throw new InvalidOperationException($"Trade ticket '{trade.TicketId}' does not exist.");
        }

        var updatedTrade = trade with
        {
            Version = expectedVersion.Value + 1,
            CreatedAt = string.IsNullOrWhiteSpace(trade.CreatedAt) ? existing.CreatedAt : trade.CreatedAt
        };

        await using var updateCommand = _connection.CreateCommand();
        updateCommand.Transaction = sqliteTransaction;
        updateCommand.CommandText =
            """
            UPDATE trade_tickets
            SET
                version = $version,
                status = $status,
                trade_type = $tradeType,
                asset_class = $assetClass,
                product_type = $productType,
                instrument = $instrument,
                side = $side,
                quantity = $quantity,
                price = $price,
                currency = $currency,
                book = $book,
                trader = $trader,
                counterparty = $counterparty,
                workflow_id = $workflowId,
                workflow_instance_id = $workflowInstanceId,
                workflow_version = $workflowVersion,
                workflow_instance_version = $workflowInstanceVersion,
                updated_at = $updatedAt,
                payload_json = $payloadJson
            WHERE ticket_id = $ticketId
              AND version = $expectedVersion;
            """;
        BindTrade(updateCommand, updatedTrade);
        updateCommand.Parameters.AddWithValue("$expectedVersion", expectedVersion.Value);

        if (await updateCommand.ExecuteNonQueryAsync(cancellationToken) == 0)
        {
            throw new OptimisticConcurrencyException(
                $"Trade ticket '{trade.TicketId}' could not be updated because the expected version {expectedVersion.Value} is stale.");
        }

        return updatedTrade;
    }

    private static void BindTrade(SqliteCommand command, TradeTicket trade)
    {
        command.Parameters.AddWithValue("$ticketId", trade.TicketId);
        command.Parameters.AddWithValue("$version", trade.Version);
        command.Parameters.AddWithValue("$status", trade.Status);
        command.Parameters.AddWithValue("$tradeType", trade.TradeType);
        command.Parameters.AddWithValue("$assetClass", trade.AssetClass);
        command.Parameters.AddWithValue("$productType", trade.ProductType);
        command.Parameters.AddWithValue("$instrument", trade.Instrument);
        command.Parameters.AddWithValue("$side", trade.Side);
        command.Parameters.AddWithValue("$quantity", trade.Quantity);
        command.Parameters.AddWithValue("$price", trade.Price);
        command.Parameters.AddWithValue("$currency", trade.Currency);
        command.Parameters.AddWithValue("$book", trade.Book);
        command.Parameters.AddWithValue("$trader", trade.Trader);
        command.Parameters.AddWithValue("$counterparty", trade.Counterparty);
        command.Parameters.AddWithValue("$workflowId", trade.WorkflowId);
        command.Parameters.AddWithValue("$workflowInstanceId", (object?)trade.WorkflowInstanceId ?? DBNull.Value);
        command.Parameters.AddWithValue("$workflowVersion", trade.WorkflowVersion);
        command.Parameters.AddWithValue("$workflowInstanceVersion", trade.WorkflowInstanceVersion);
        command.Parameters.AddWithValue("$createdAt", trade.CreatedAt);
        command.Parameters.AddWithValue("$updatedAt", trade.UpdatedAt);
        command.Parameters.AddWithValue("$payloadJson", SqliteJson.Serialize(trade));
    }
}
