using Microsoft.Data.Sqlite;

namespace Squiddy.Serverless.Persistence;

public sealed class SqliteDatabaseInitializer
{
    private readonly SqliteConnectionFactory _connectionFactory;

    public SqliteDatabaseInitializer(SqliteConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task InitializeAsync(IEnumerable<WorkflowDefinition> seedWorkflows, CancellationToken cancellationToken = default)
    {
        await using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        // Definitions need their table shape fixed first because instances and audits now
        // reference versioned definitions, and categories are backfilled onto those rows.
        await MigrateWorkflowDefinitionsTableAsync(connection, cancellationToken);
        await MigrateWorkflowInstancesTableAsync(connection, cancellationToken);

        foreach (var statement in SchemaStatements)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = statement;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await EnsureColumnAsync(connection, "workflow_definitions", "category_id", "TEXT NOT NULL DEFAULT 'general'", cancellationToken);
        await EnsureColumnAsync(connection, "workflow_instances", "version", "INTEGER NOT NULL DEFAULT 1", cancellationToken);
        await EnsureColumnAsync(connection, "workflow_instances", "workflow_version", "INTEGER NOT NULL DEFAULT 1", cancellationToken);
        await EnsureColumnAsync(connection, "workflow_audit_transactions", "workflow_version", "INTEGER NOT NULL DEFAULT 1", cancellationToken);
        await EnsureDefaultCategoryAsync(connection, cancellationToken);
        await BackfillWorkflowCategoriesAsync(connection, cancellationToken);
        await BackfillWorkflowInstanceVersionsAsync(connection, cancellationToken);
        await BackfillWorkflowAuditVersionsAsync(connection, cancellationToken);

        var repository = new SqliteWorkflowDefinitionRepository(connection);
        await repository.CanonicalizeAllAsync(cancellationToken);

        foreach (var seedWorkflow in seedWorkflows)
        {
            if (await repository.GetAsync(seedWorkflow.Id, cancellationToken: cancellationToken) is null)
            {
                await repository.SaveAsync(seedWorkflow, expectedVersion: null, cancellationToken: cancellationToken);
            }
        }

        await SeedTradeTicketsAsync(connection, cancellationToken);
    }

    private static readonly string[] SchemaStatements =
    {
        """
        CREATE TABLE IF NOT EXISTS workflow_categories (
            category_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_definitions (
            workflow_id TEXT NOT NULL,
            category_id TEXT NOT NULL DEFAULT 'general',
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workflow_id, version)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_instances (
            instance_id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 1,
            current_status TEXT NOT NULL,
            context_json TEXT NOT NULL,
            last_evaluation_json TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_definitions (workflow_id, version)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS workflow_audit_transactions (
            transaction_id TEXT PRIMARY KEY,
            instance_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL DEFAULT 1,
            trigger_source TEXT NOT NULL,
            actor_id TEXT NULL,
            correlation_id TEXT NULL,
            starting_status TEXT NOT NULL,
            final_status TEXT NOT NULL,
            context_json TEXT NOT NULL,
            evaluation_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES workflow_instances (instance_id),
            FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_definitions (workflow_id, version)
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
        """,
        """
        CREATE TABLE IF NOT EXISTS trade_tickets (
            ticket_id TEXT PRIMARY KEY,
            version INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            product_type TEXT NOT NULL,
            instrument TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            currency TEXT NOT NULL,
            book TEXT NOT NULL,
            trader TEXT NOT NULL,
            counterparty TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            workflow_instance_id TEXT NULL,
            workflow_version INTEGER NOT NULL DEFAULT 1,
            workflow_instance_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS trade_ticket_audit (
            audit_id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            trade_version INTEGER NOT NULL,
            action_code TEXT NOT NULL,
            description TEXT NULL,
            trigger_source TEXT NULL,
            actor_id TEXT NULL,
            correlation_id TEXT NULL,
            metadata_json TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES trade_tickets (ticket_id)
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

    private static async Task MigrateWorkflowDefinitionsTableAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        if (!await TableExistsAsync(connection, "workflow_definitions", cancellationToken))
        {
            return;
        }

        var columns = await GetColumnsAsync(connection, "workflow_definitions", cancellationToken);
        var pkColumns = await GetPrimaryKeyColumnsAsync(connection, "workflow_definitions", cancellationToken);
        if (pkColumns.SequenceEqual(new[] { "workflow_id", "version" }, StringComparer.OrdinalIgnoreCase))
        {
            return;
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            ALTER TABLE workflow_definitions RENAME TO workflow_definitions_legacy;
            """,
            cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            CREATE TABLE workflow_definitions (
                workflow_id TEXT NOT NULL,
                category_id TEXT NOT NULL DEFAULT 'general',
                name TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                definition_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (workflow_id, version)
            );
            """,
            cancellationToken);

        var versionProjection = columns.Contains("version") ? "COALESCE(version, 1)" : "1";
        var categoryProjection = columns.Contains("category_id") ? "COALESCE(category_id, 'general')" : "'general'";
        await ExecuteNonQueryAsync(connection, transaction,
            $"""
            INSERT INTO workflow_definitions (workflow_id, category_id, name, version, definition_json, created_at, updated_at)
            SELECT
                workflow_id,
                {categoryProjection},
                name,
                {versionProjection},
                definition_json,
                created_at,
                updated_at
            FROM workflow_definitions_legacy;
            """,
            cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            DROP TABLE workflow_definitions_legacy;
            """,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task MigrateWorkflowInstancesTableAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        if (!await TableExistsAsync(connection, "workflow_instances", cancellationToken))
        {
            return;
        }

        var columns = await GetColumnsAsync(connection, "workflow_instances", cancellationToken);
        if (columns.Contains("workflow_version"))
        {
            return;
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            ALTER TABLE workflow_instances RENAME TO workflow_instances_legacy;
            """,
            cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            CREATE TABLE workflow_instances (
                instance_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                workflow_version INTEGER NOT NULL DEFAULT 1,
                version INTEGER NOT NULL DEFAULT 1,
                current_status TEXT NOT NULL,
                context_json TEXT NOT NULL,
                last_evaluation_json TEXT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_definitions (workflow_id, version)
            );
            """,
            cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
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
            SELECT
                legacy.instance_id,
                legacy.workflow_id,
                COALESCE((
                    SELECT MAX(definition.version)
                    FROM workflow_definitions definition
                    WHERE definition.workflow_id = legacy.workflow_id
                ), 1),
                legacy.version,
                legacy.current_status,
                legacy.context_json,
                legacy.last_evaluation_json,
                legacy.created_at,
                legacy.updated_at
            FROM workflow_instances_legacy legacy;
            """,
            cancellationToken);

        await ExecuteNonQueryAsync(connection, transaction,
            """
            DROP TABLE workflow_instances_legacy;
            """,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task EnsureDefaultCategoryAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO workflow_categories (category_id, name, description, created_at, updated_at)
            VALUES ('general', 'General', 'Default workflow category.', $createdAt, $updatedAt)
            ON CONFLICT(category_id) DO NOTHING;
            """;
        command.Parameters.AddWithValue("$createdAt", now);
        command.Parameters.AddWithValue("$updatedAt", now);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task BackfillWorkflowCategoriesAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        // Older rows predate categories entirely, so we normalize them onto the default category
        // before the repository reserializes their definition JSON.
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE workflow_definitions
            SET category_id = 'general'
            WHERE category_id IS NULL
               OR TRIM(category_id) = '';
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task BackfillWorkflowInstanceVersionsAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE workflow_instances
            SET workflow_version = COALESCE((
                SELECT MAX(definition.version)
                FROM workflow_definitions definition
                WHERE definition.workflow_id = workflow_instances.workflow_id
            ), 1)
            WHERE workflow_version IS NULL
               OR workflow_version <= 0;
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task BackfillWorkflowAuditVersionsAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE workflow_audit_transactions
            SET workflow_version = COALESCE((
                SELECT instance.workflow_version
                FROM workflow_instances instance
                WHERE instance.instance_id = workflow_audit_transactions.instance_id
            ), COALESCE((
                SELECT MAX(definition.version)
                FROM workflow_definitions definition
                WHERE definition.workflow_id = workflow_audit_transactions.workflow_id
            ), 1))
            WHERE workflow_version IS NULL
               OR workflow_version <= 0;
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task SeedTradeTicketsAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        var tradeRepository = new SqliteTradeTicketRepository(connection);
        var auditRepository = new SqliteTradeTicketAuditRepository(connection);

        await using var countCommand = connection.CreateCommand();
        countCommand.CommandText = "SELECT COUNT(*) FROM trade_tickets;";
        var existingCount = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken));
        if (existingCount > 0)
        {
            return;
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        foreach (var seedTrade in SqliteSeedData.SeedTradeTickets)
        {
            var savedTrade = await tradeRepository.SaveAsync(seedTrade, expectedVersion: null, new SqliteWorkflowStorageTransaction(transaction), cancellationToken);
            var auditRecord = new TradeTicketAuditRecord(
                Guid.NewGuid().ToString("N"),
                savedTrade.TicketId,
                savedTrade.Version,
                "TRADE_SEEDED",
                "Seeded demo trade inserted into the local database.",
                "database-initializer",
                "system",
                savedTrade.TicketId,
                new Dictionary<string, string?>
                {
                    ["seeded"] = "true"
                },
                savedTrade.CreatedAt,
                savedTrade);
            await auditRepository.AppendAsync(auditRecord, new SqliteWorkflowStorageTransaction(transaction), cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task<bool> TableExistsAsync(SqliteConnection connection, string tableName, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table'
              AND name = $tableName;
            """;
        command.Parameters.AddWithValue("$tableName", tableName);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken)) > 0;
    }

    private static async Task<HashSet<string>> GetColumnsAsync(SqliteConnection connection, string tableName, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({tableName});";

        var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            existingColumns.Add(reader.GetString(1));
        }

        return existingColumns;
    }

    private static async Task<IReadOnlyList<string>> GetPrimaryKeyColumnsAsync(SqliteConnection connection, string tableName, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({tableName});";

        var columns = new List<(int Position, string Name)>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var pkPosition = reader.GetInt32(5);
            if (pkPosition > 0)
            {
                columns.Add((pkPosition, reader.GetString(1)));
            }
        }

        return columns.OrderBy(item => item.Position).Select(item => item.Name).ToArray();
    }

    private static async Task ExecuteNonQueryAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string sql,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
