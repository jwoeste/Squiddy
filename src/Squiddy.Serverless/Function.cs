using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Squiddy.Serverless.Contracts;
using Squiddy.Serverless.Persistence;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace Squiddy.Serverless;

public class Function
{
    private static readonly JsonSerializerOptions JsonOptions = SqliteJson.SerializerOptions;
    private static readonly SqliteOptions DatabaseOptions = new();
    private static readonly SqliteConnectionFactory ConnectionFactory = new(DatabaseOptions);
    private static readonly IWorkflowStorageBackendFactory StorageBackendFactory =
        new SqliteWorkflowStorageBackendFactory(ConnectionFactory, DatabaseOptions);
    private static readonly SqliteDatabaseInitializer DatabaseInitializer = new(ConnectionFactory);
    private static readonly Task InitializationTask = DatabaseInitializer.InitializeAsync(SqliteSeedData.SeedWorkflows);

    private readonly WorkflowEngine _workflowEngine = new();

    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        try
        {
            await InitializationTask;

            var method = request.RequestContext?.Http?.Method?.ToUpperInvariant() ?? "GET";
            var route = NormalizeRoute(request.RawPath);

            return await RouteAsync(method, route, request, context);
        }
        catch (OptimisticConcurrencyException exception)
        {
            return Error(HttpStatusCode.Conflict, exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Error(HttpStatusCode.BadRequest, exception.Message);
        }
        catch (JsonException exception)
        {
            return Error(HttpStatusCode.BadRequest, $"Invalid JSON payload: {exception.Message}");
        }
        catch (Exception exception)
        {
            return Error(HttpStatusCode.InternalServerError, exception.Message);
        }
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> RouteAsync(
        string method,
        string route,
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        await using var backend = await StorageBackendFactory.CreateAsync();

        var workflowRepository = backend.WorkflowDefinitions;
        var workflowInstanceRepository = backend.WorkflowInstances;
        var workflowAuditRepository = backend.WorkflowAudits;
        var workflowCategoryRepository = backend.WorkflowCategories;
        var tradeTicketRepository = backend.TradeTickets;
        var tradeTicketAuditRepository = backend.TradeTicketAudits;

        var segments = route.Split('/', StringSplitOptions.RemoveEmptyEntries);

        if (method == "GET" && route == "/")
        {
            return Ok(new
            {
                service = "Squiddy workflow engine",
                requestId = context.AwsRequestId,
                databasePath = DatabaseOptions.DatabasePath,
                endpoints = new[]
                {
                    "GET /workflows",
                    "GET /workflow-categories",
                    "GET /diagnostics/storage",
                    "GET /workflows/{workflowId}",
                    "GET /workflows/{workflowId}/versions",
                    "GET /workflows/{workflowId}/versions/{version}",
                    "POST /workflows",
                    "POST /workflow-categories",
                    "POST /workflows/{workflowId}/rollback",
                    "DELETE /workflow-categories/{categoryId}",
                    "DELETE /workflows/{workflowId}",
                    "POST /workflows/evaluate",
                    "GET /workflow-instances",
                    "POST /workflow-instances",
                    "POST /workflow-instances/{instanceId}/commands",
                    "GET /workflow-instances/{instanceId}",
                    "GET /workflow-instances/{instanceId}/audit-trail",
                    "GET /trades",
                    "GET /trades/{ticketId}",
                    "POST /trades",
                    "GET /trades/{ticketId}/audit-trail"
                }
            });
        }

        if (method == "GET" && route == "/workflows")
        {
            return Ok(await workflowRepository.ListAsync());
        }

        if (method == "GET" && route == "/workflow-categories")
        {
            return Ok(await workflowCategoryRepository.ListAsync());
        }

        if (method == "GET" && route == "/diagnostics/storage")
        {
            return await GetStorageDiagnosticsAsync(backend);
        }

        if (method == "POST" && route == "/workflows")
        {
            return await SaveWorkflowAsync(request, workflowRepository, workflowCategoryRepository);
        }

        if (method == "POST" && route == "/workflow-categories")
        {
            return await SaveWorkflowCategoryAsync(request, backend, workflowCategoryRepository);
        }

        if (method == "GET" && segments.Length == 3 && segments[0] == "workflows" && segments[2] == "versions")
        {
            return await ListWorkflowVersionsAsync(segments[1], workflowRepository);
        }

        if (method == "GET" && segments.Length == 4 && segments[0] == "workflows" && segments[2] == "versions")
        {
            return await GetWorkflowVersionAsync(segments[1], segments[3], workflowRepository);
        }

        if (method == "POST" && segments.Length == 3 && segments[0] == "workflows" && segments[2] == "rollback")
        {
            return await RollbackWorkflowAsync(request, backend, segments[1], workflowRepository, workflowInstanceRepository);
        }

        if (method == "DELETE" && segments.Length == 2 && segments[0] == "workflows")
        {
            return await DeleteWorkflowAsync(backend, segments[1], workflowRepository, workflowInstanceRepository, workflowAuditRepository);
        }

        if (method == "DELETE" && segments.Length == 2 && segments[0] == "workflow-categories")
        {
            return await DeleteWorkflowCategoryAsync(backend, segments[1], workflowCategoryRepository);
        }

        if (method == "POST" && route == "/workflows/evaluate")
        {
            return await EvaluateWorkflowDefinitionAsync(request);
        }

        if (method == "POST" && route == "/workflow-instances")
        {
            return await CreateWorkflowInstanceAsync(request, backend, workflowRepository, workflowInstanceRepository, workflowAuditRepository);
        }

        if (method == "GET" && route == "/trades")
        {
            return Ok(await tradeTicketRepository.ListAsync());
        }

        if (method == "POST" && route == "/trades")
        {
            return await SaveTradeTicketAsync(request, backend, tradeTicketRepository, tradeTicketAuditRepository);
        }

        if (method == "POST" && segments.Length == 3 && segments[0] == "workflow-instances" && segments[2] == "commands")
        {
            return await ExecuteWorkflowInstanceCommandAsync(
                request,
                backend,
                segments[1],
                workflowRepository,
                workflowInstanceRepository,
                workflowAuditRepository);
        }

        if (method == "GET" && route == "/workflow-instances")
        {
            return Ok(await workflowInstanceRepository.ListAsync());
        }

        if (method == "GET" && segments.Length == 2 && segments[0] == "workflows")
        {
            return await GetWorkflowAsync(segments[1], workflowRepository);
        }

        if (method == "GET" && segments.Length == 2 && segments[0] == "workflow-instances")
        {
            return await GetWorkflowInstanceAsync(segments[1], workflowInstanceRepository);
        }

        if (method == "GET" && segments.Length == 2 && segments[0] == "trades")
        {
            return await GetTradeTicketAsync(segments[1], tradeTicketRepository);
        }

        if (method == "GET" && segments.Length == 3 && segments[0] == "workflow-instances" && segments[2] == "audit-trail")
        {
            return Ok(await workflowAuditRepository.ListByInstanceAsync(segments[1]));
        }

        if (method == "GET" && segments.Length == 3 && segments[0] == "trades" && segments[2] == "audit-trail")
        {
            return Ok(await tradeTicketAuditRepository.ListByTicketIdAsync(segments[1]));
        }

        return Error(HttpStatusCode.NotFound, "Route not found.");
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> SaveWorkflowAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowDefinitionRepository workflowRepository,
        IWorkflowCategoryRepository workflowCategoryRepository)
    {
        var payload = DeserializeBody<SaveWorkflowDefinitionRequest>(request.Body);
        if (payload.Workflow is null)
        {
            throw new InvalidOperationException("Workflow is required.");
        }

        BreakIntoDebuggerOnWorkflowSave(payload.Workflow);

        var workflow = NormalizeWorkflow(payload.Workflow);
        if (await workflowCategoryRepository.GetAsync(workflow.CategoryId) is null)
        {
            throw new InvalidOperationException($"Workflow.CategoryId '{workflow.CategoryId}' does not exist.");
        }

        ValidateWorkflow(workflow);
        var savedWorkflow = await workflowRepository.SaveAsync(workflow, payload.ExpectedVersion);

        return Response(payload.ExpectedVersion is null ? HttpStatusCode.Created : HttpStatusCode.OK, savedWorkflow);
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> SaveWorkflowCategoryAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowStorageBackend backend,
        IWorkflowCategoryRepository workflowCategoryRepository)
    {
        var payload = DeserializeBody<SaveWorkflowCategoryRequest>(request.Body);
        if (payload.Category is null)
        {
            throw new InvalidOperationException("Category is required.");
        }

        if (string.IsNullOrWhiteSpace(payload.Category.Id))
        {
            throw new InvalidOperationException("Category.Id is required.");
        }

        if (string.IsNullOrWhiteSpace(payload.Category.Name))
        {
            throw new InvalidOperationException("Category.Name is required.");
        }

        await using var transaction = await backend.BeginTransactionAsync();
        var savedCategory = await workflowCategoryRepository.SaveAsync(payload.Category, payload.OriginalCategoryId, transaction);
        await transaction.CommitAsync();
        return Ok(savedCategory);
    }

    private static void BreakIntoDebuggerOnWorkflowSave(WorkflowDefinition workflow)
    {
        var enabled = Environment.GetEnvironmentVariable("SQUIDDY_DEBUG_SAVE_BREAK");
        if (!string.Equals(enabled, "1", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(enabled, "true", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var workflowIdFilter = Environment.GetEnvironmentVariable("SQUIDDY_DEBUG_SAVE_WORKFLOW_ID");
        if (!string.IsNullOrWhiteSpace(workflowIdFilter) &&
            !string.Equals(workflowIdFilter, workflow.Id, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (Debugger.IsAttached)
        {
            Debugger.Break();
            return;
        }

        Debugger.Launch();
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> GetWorkflowAsync(
        string workflowId,
        IWorkflowDefinitionRepository workflowRepository)
    {
        var workflow = await workflowRepository.GetAsync(workflowId);
        return workflow is null
            ? Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.")
            : Ok(workflow);
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> GetStorageDiagnosticsAsync(IWorkflowStorageBackend backend) =>
        Ok(await backend.GetDiagnosticsAsync());

    private static async Task<APIGatewayHttpApiV2ProxyResponse> ListWorkflowVersionsAsync(
        string workflowId,
        IWorkflowDefinitionRepository workflowRepository)
    {
        var workflow = await workflowRepository.GetAsync(workflowId);
        if (workflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.");
        }

        return Ok(await workflowRepository.ListVersionsAsync(workflowId));
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> GetWorkflowVersionAsync(
        string workflowId,
        string versionSegment,
        IWorkflowDefinitionRepository workflowRepository)
    {
        if (!int.TryParse(versionSegment, out var version) || version <= 0)
        {
            return Error(HttpStatusCode.BadRequest, $"Workflow version '{versionSegment}' is invalid.");
        }

        var workflow = await workflowRepository.GetVersionAsync(workflowId, version);
        return workflow is null
            ? Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' version {version} was not found.")
            : Ok(workflow);
    }

    private Task<APIGatewayHttpApiV2ProxyResponse> EvaluateWorkflowDefinitionAsync(
        APIGatewayHttpApiV2ProxyRequest request)
    {
        var payload = DeserializeBody<EvaluateWorkflowRequest>(request.Body);
        var workflow = payload.Workflow;

        if (workflow is null)
        {
            throw new InvalidOperationException("Workflow is required.");
        }

        workflow = NormalizeWorkflow(workflow);
        ValidateWorkflow(workflow);

        if (string.IsNullOrWhiteSpace(payload.CurrentStatus))
        {
            throw new InvalidOperationException("CurrentStatus is required.");
        }

        var result = _workflowEngine.Evaluate(
            workflow,
            payload.CurrentStatus,
            payload.Context ?? new Dictionary<string, string?>());

        return Task.FromResult(Ok(result));
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> DeleteWorkflowAsync(
        IWorkflowStorageBackend backend,
        string workflowId,
        IWorkflowDefinitionRepository workflowRepository,
        IWorkflowInstanceRepository workflowInstanceRepository,
        IWorkflowAuditRepository workflowAuditRepository)
    {
        var existingWorkflow = await workflowRepository.GetAsync(workflowId);
        if (existingWorkflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.");
        }

        await using var transaction = await backend.BeginTransactionAsync();
        await workflowAuditRepository.DeleteByWorkflowIdAsync(workflowId, transaction);
        await workflowInstanceRepository.DeleteByWorkflowIdAsync(workflowId, transaction);
        await workflowRepository.DeleteAsync(workflowId, transaction);
        await transaction.CommitAsync();

        return new APIGatewayHttpApiV2ProxyResponse
        {
            StatusCode = (int)HttpStatusCode.NoContent,
            Headers = new Dictionary<string, string>()
        };
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> DeleteWorkflowCategoryAsync(
        IWorkflowStorageBackend backend,
        string categoryId,
        IWorkflowCategoryRepository workflowCategoryRepository)
    {
        var existingCategory = await workflowCategoryRepository.GetAsync(categoryId);
        if (existingCategory is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow category '{categoryId}' was not found.");
        }

        if (string.Equals(categoryId, "general", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Workflow category 'general' cannot be deleted.");
        }

        var usageCount = await workflowCategoryRepository.CountWorkflowDefinitionsAsync(categoryId);
        if (usageCount > 0)
        {
            throw new InvalidOperationException(
                $"Workflow category '{categoryId}' cannot be deleted because {usageCount} workflow definition version(s) still reference it.");
        }

        await using var transaction = await backend.BeginTransactionAsync();
        await workflowCategoryRepository.DeleteAsync(categoryId, transaction);
        await transaction.CommitAsync();

        return new APIGatewayHttpApiV2ProxyResponse
        {
            StatusCode = (int)HttpStatusCode.NoContent,
            Headers = new Dictionary<string, string>()
        };
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> RollbackWorkflowAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowStorageBackend backend,
        string workflowId,
        IWorkflowDefinitionRepository workflowRepository,
        IWorkflowInstanceRepository workflowInstanceRepository)
    {
        var payload = DeserializeBody<RollbackWorkflowVersionRequest>(request.Body);
        if (payload.TargetVersion <= 0)
        {
            throw new InvalidOperationException("TargetVersion must be greater than zero.");
        }

        await using var transaction = await backend.BeginTransactionAsync();

        var targetWorkflow = await workflowRepository.GetVersionAsync(workflowId, payload.TargetVersion, transaction);
        if (targetWorkflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' version {payload.TargetVersion} was not found.");
        }

        var latestVersion = await workflowRepository.GetLatestVersionNumberAsync(workflowId, transaction);
        if (latestVersion is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.");
        }

        if (payload.TargetVersion == latestVersion.Value)
        {
            await transaction.CommitAsync();
            return Ok(new
            {
                workflow = targetWorkflow,
                versions = await workflowRepository.ListVersionsAsync(workflowId, cancellationToken: default)
            });
        }

        if (payload.TargetVersion > latestVersion.Value)
        {
            throw new InvalidOperationException(
                $"Cannot roll back workflow '{workflowId}' to version {payload.TargetVersion} because the latest version is {latestVersion.Value}.");
        }

        if (await workflowInstanceRepository.AnyForWorkflowVersionsNewerThanAsync(workflowId, payload.TargetVersion, transaction))
        {
            throw new InvalidOperationException(
                $"Cannot roll back workflow '{workflowId}' to version {payload.TargetVersion} because one or more newer versions are referenced by workflow instances.");
        }

        await workflowRepository.DeleteVersionsNewerThanAsync(workflowId, payload.TargetVersion, transaction);
        await transaction.CommitAsync();

        return Ok(new
        {
            workflow = targetWorkflow,
            versions = await workflowRepository.ListVersionsAsync(workflowId)
        });
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> CreateWorkflowInstanceAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowStorageBackend backend,
        IWorkflowDefinitionRepository workflowRepository,
        IWorkflowInstanceRepository workflowInstanceRepository,
        IWorkflowAuditRepository workflowAuditRepository)
    {
        var payload = DeserializeBody<CreateWorkflowInstanceRequest>(request.Body);

        if (string.IsNullOrWhiteSpace(payload.WorkflowId))
        {
            throw new InvalidOperationException("WorkflowId is required.");
        }

        await using var transaction = await backend.BeginTransactionAsync();

        var workflow = await workflowRepository.GetAsync(payload.WorkflowId, transaction);
        if (workflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{payload.WorkflowId}' was not found.");
        }

        var now = DateTimeOffset.UtcNow;
        var context = payload.Context ?? new Dictionary<string, string?>();
        var result = _workflowEngine.Evaluate(workflow, workflow.InitialStatus, context);
        var instanceId = string.IsNullOrWhiteSpace(payload.InstanceId) ? Guid.NewGuid().ToString("N") : payload.InstanceId;
        var instance = new WorkflowInstance(
            instanceId,
            workflow.Id,
            workflow.Version,
            0,
            result.FinalStatus,
            context,
            result,
            now,
            now);

        var savedInstance = await workflowInstanceRepository.SaveAsync(instance, expectedVersion: null, transaction);
        var auditTransaction = BuildAuditTransaction(
            savedInstance,
            result,
            triggerSource: string.IsNullOrWhiteSpace(payload.TriggerSource) ? "workflow-instance-create" : payload.TriggerSource,
            payload.ActorId,
            payload.CorrelationId,
            now);

        await workflowAuditRepository.AppendTransactionAsync(auditTransaction, transaction);
        await transaction.CommitAsync();

        return Response(HttpStatusCode.Created, new
        {
            instance = savedInstance,
            transaction = auditTransaction
        });
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> ExecuteWorkflowInstanceCommandAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowStorageBackend backend,
        string instanceId,
        IWorkflowDefinitionRepository workflowRepository,
        IWorkflowInstanceRepository workflowInstanceRepository,
        IWorkflowAuditRepository workflowAuditRepository)
    {
        var payload = DeserializeBody<ExecuteWorkflowInstanceCommandRequest>(request.Body);

        await using var transaction = await backend.BeginTransactionAsync();

        var existingInstance = await workflowInstanceRepository.GetAsync(instanceId, transaction);
        if (existingInstance is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow instance '{instanceId}' was not found.");
        }

        var workflow = await workflowRepository.GetVersionAsync(
            existingInstance.WorkflowId,
            existingInstance.WorkflowVersion,
            transaction);
        if (workflow is null)
        {
            return Error(
                HttpStatusCode.NotFound,
                $"Workflow '{existingInstance.WorkflowId}' version {existingInstance.WorkflowVersion} was not found.");
        }

        var mergedContext = MergeContext(existingInstance.Context, payload.Context);
        var result = _workflowEngine.ExecuteManualCommand(
            workflow,
            existingInstance.CurrentStatus,
            payload.CommandCode,
            mergedContext);

        var now = DateTimeOffset.UtcNow;
        var updatedInstance = existingInstance with
        {
            CurrentStatus = result.FinalStatus,
            Context = mergedContext,
            LastEvaluation = result,
            UpdatedAt = now
        };

        updatedInstance = await workflowInstanceRepository.SaveAsync(updatedInstance, payload.ExpectedVersion, transaction);

        var auditTransaction = BuildAuditTransaction(
            updatedInstance,
            result,
            triggerSource: string.IsNullOrWhiteSpace(payload.TriggerSource) ? "workflow-instance-command" : payload.TriggerSource,
            payload.ActorId,
            payload.CorrelationId,
            now);

        await workflowAuditRepository.AppendTransactionAsync(auditTransaction, transaction);
        await transaction.CommitAsync();

        return Ok(new
        {
            instance = updatedInstance,
            transaction = auditTransaction
        });
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> GetWorkflowInstanceAsync(
        string instanceId,
        IWorkflowInstanceRepository workflowInstanceRepository)
    {
        var instance = await workflowInstanceRepository.GetAsync(instanceId);
        return instance is null
            ? Error(HttpStatusCode.NotFound, $"Workflow instance '{instanceId}' was not found.")
            : Ok(instance);
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> GetTradeTicketAsync(
        string ticketId,
        ITradeTicketRepository tradeTicketRepository)
    {
        var trade = await tradeTicketRepository.GetAsync(ticketId);
        return trade is null
            ? Error(HttpStatusCode.NotFound, $"Trade ticket '{ticketId}' was not found.")
            : Ok(trade);
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> SaveTradeTicketAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        IWorkflowStorageBackend backend,
        ITradeTicketRepository tradeTicketRepository,
        ITradeTicketAuditRepository tradeTicketAuditRepository)
    {
        var payload = DeserializeBody<SaveTradeTicketRequest>(request.Body);
        if (payload.Trade is null)
        {
            throw new InvalidOperationException("Trade is required.");
        }

        var normalizedTrade = NormalizeTrade(payload.Trade);
        await using var transaction = await backend.BeginTransactionAsync();
        var existingTrade = await tradeTicketRepository.GetAsync(normalizedTrade.TicketId, transaction);
        var savedTrade = await tradeTicketRepository.SaveAsync(
            normalizedTrade,
            payload.ExpectedVersion,
            transaction);

        var auditRecord = BuildTradeAuditRecord(
            savedTrade,
            payload.ActionCode,
            payload.Description,
            payload.TriggerSource,
            payload.ActorId,
            payload.CorrelationId,
            payload.Metadata);
        await tradeTicketAuditRepository.AppendAsync(auditRecord, transaction);
        await transaction.CommitAsync();

        return Response(existingTrade is null ? HttpStatusCode.Created : HttpStatusCode.OK, new
        {
            trade = savedTrade,
            audit = auditRecord
        });
    }

    private static WorkflowAuditTransaction BuildAuditTransaction(
        WorkflowInstance instance,
        WorkflowEvaluationResult result,
        string triggerSource,
        string? actorId,
        string? correlationId,
        DateTimeOffset createdAt)
    {
        var transactionId = Guid.NewGuid().ToString("N");
        var entries = result.AppliedActions
            .Select((action, index) => new WorkflowAuditEntry(
                Guid.NewGuid().ToString("N"),
                transactionId,
                index + 1,
                action.ActionCode,
                action.FromStatus,
                action.ToStatus,
                action.AppliedAutomatically,
                createdAt))
            .ToArray();

        return new WorkflowAuditTransaction(
            transactionId,
            instance.Id,
            instance.WorkflowId,
            instance.WorkflowVersion,
            triggerSource,
            actorId,
            correlationId,
            result.StartingStatus,
            result.FinalStatus,
            new Dictionary<string, string?>(instance.Context),
            result,
            createdAt,
            entries);
    }

    private static TradeTicketAuditRecord BuildTradeAuditRecord(
        TradeTicket trade,
        string actionCode,
        string? description,
        string? triggerSource,
        string? actorId,
        string? correlationId,
        IReadOnlyDictionary<string, string?>? metadata)
    {
        var createdAt = DateTimeOffset.UtcNow.ToString("O");
        return new TradeTicketAuditRecord(
            Guid.NewGuid().ToString("N"),
            trade.TicketId,
            trade.Version,
            string.IsNullOrWhiteSpace(actionCode) ? "TRADE_SAVED" : actionCode.Trim(),
            string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            string.IsNullOrWhiteSpace(triggerSource) ? "trade-ticket-api" : triggerSource.Trim(),
            string.IsNullOrWhiteSpace(actorId) ? null : actorId.Trim(),
            string.IsNullOrWhiteSpace(correlationId) ? null : correlationId.Trim(),
            metadata is null
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?>(metadata),
            createdAt,
            trade);
    }

    private static IReadOnlyDictionary<string, string?> MergeContext(
        IReadOnlyDictionary<string, string?> existingContext,
        IReadOnlyDictionary<string, string?>? contextPatch)
    {
        var merged = new Dictionary<string, string?>(existingContext, StringComparer.OrdinalIgnoreCase);
        if (contextPatch is null)
        {
            return merged;
        }

        foreach (var pair in contextPatch)
        {
            merged[pair.Key] = pair.Value;
        }

        return merged;
    }

    private static T DeserializeBody<T>(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            throw new InvalidOperationException("Request body is required.");
        }

        var payload = JsonSerializer.Deserialize<T>(body, JsonOptions);
        if (payload is null)
        {
            throw new InvalidOperationException("Request body could not be parsed.");
        }

        return payload;
    }

    private static WorkflowDefinition NormalizeWorkflow(WorkflowDefinition workflow) =>
        (workflow with
        {
            CategoryId = string.IsNullOrWhiteSpace(workflow.CategoryId) ? "general" : workflow.CategoryId.Trim(),
            Statuses = (workflow.Statuses ?? Array.Empty<WorkflowStatus>())
                .Select(status => status with
                {
                    Actions = (status.Actions ?? Array.Empty<WorkflowAction>())
                        .Select(action => action with
                        {
                            Conditions = action.Conditions ?? Array.Empty<ConditionRule>()
                        })
                        .ToArray()
                })
                .ToArray()
        }) is var normalized
            ? normalized with
            {
                InitialStatus = string.IsNullOrWhiteSpace(normalized.InitialStatus)
                    ? normalized.Statuses?.FirstOrDefault()?.Code ?? string.Empty
                    : normalized.InitialStatus
            }
            : workflow;

    private static TradeTicket NormalizeTrade(TradeTicket trade)
    {
        if (string.IsNullOrWhiteSpace(trade.TicketId))
        {
            throw new InvalidOperationException("Trade.TicketId is required.");
        }

        var now = DateTimeOffset.UtcNow.ToString("O");
        return trade with
        {
            TicketId = trade.TicketId.Trim(),
            Status = string.IsNullOrWhiteSpace(trade.Status) ? "Captured" : trade.Status.Trim(),
            TradeType = string.IsNullOrWhiteSpace(trade.TradeType) ? "Cash" : trade.TradeType.Trim(),
            AssetClass = string.IsNullOrWhiteSpace(trade.AssetClass) ? "Equity" : trade.AssetClass.Trim(),
            ProductType = string.IsNullOrWhiteSpace(trade.ProductType) ? string.Empty : trade.ProductType.Trim(),
            Instrument = string.IsNullOrWhiteSpace(trade.Instrument) ? string.Empty : trade.Instrument.Trim(),
            Side = string.Equals(trade.Side, "Sell", StringComparison.OrdinalIgnoreCase) ? "Sell" : "Buy",
            Currency = string.IsNullOrWhiteSpace(trade.Currency) ? "USD" : trade.Currency.Trim().ToUpperInvariant(),
            TradeDate = string.IsNullOrWhiteSpace(trade.TradeDate) ? string.Empty : trade.TradeDate.Trim(),
            SettleDate = string.IsNullOrWhiteSpace(trade.SettleDate) ? string.Empty : trade.SettleDate.Trim(),
            Book = string.IsNullOrWhiteSpace(trade.Book) ? string.Empty : trade.Book.Trim(),
            Strategy = string.IsNullOrWhiteSpace(trade.Strategy) ? string.Empty : trade.Strategy.Trim(),
            Trader = string.IsNullOrWhiteSpace(trade.Trader) ? string.Empty : trade.Trader.Trim(),
            Counterparty = string.IsNullOrWhiteSpace(trade.Counterparty) ? string.Empty : trade.Counterparty.Trim(),
            Venue = string.IsNullOrWhiteSpace(trade.Venue) ? string.Empty : trade.Venue.Trim(),
            Broker = string.IsNullOrWhiteSpace(trade.Broker) ? string.Empty : trade.Broker.Trim(),
            SettlementInstruction = string.IsNullOrWhiteSpace(trade.SettlementInstruction) ? string.Empty : trade.SettlementInstruction.Trim(),
            Notes = string.IsNullOrWhiteSpace(trade.Notes) ? string.Empty : trade.Notes,
            SettlementLocation = string.IsNullOrWhiteSpace(trade.SettlementLocation) ? string.Empty : trade.SettlementLocation.Trim(),
            CashAccount = string.IsNullOrWhiteSpace(trade.CashAccount) ? string.Empty : trade.CashAccount.Trim(),
            SettlementComments = string.IsNullOrWhiteSpace(trade.SettlementComments) ? string.Empty : trade.SettlementComments,
            ExceptionState = string.IsNullOrWhiteSpace(trade.ExceptionState) ? null : trade.ExceptionState.Trim(),
            WorkflowId = string.IsNullOrWhiteSpace(trade.WorkflowId) ? "trade-ticket" : trade.WorkflowId.Trim(),
            WorkflowInstanceId = string.IsNullOrWhiteSpace(trade.WorkflowInstanceId) ? null : trade.WorkflowInstanceId.Trim(),
            Checks = (trade.Checks ?? Array.Empty<TradeTicketCheck>())
                .Select(check => check with
                {
                    Id = string.IsNullOrWhiteSpace(check.Id) ? Guid.NewGuid().ToString("N") : check.Id.Trim(),
                    Label = string.IsNullOrWhiteSpace(check.Label) ? "Unnamed check" : check.Label.Trim(),
                    Description = string.IsNullOrWhiteSpace(check.Description) ? string.Empty : check.Description.Trim()
                })
                .ToArray(),
            Allocations = (trade.Allocations ?? Array.Empty<TradeTicketAllocation>())
                .Select(allocation => allocation with
                {
                    Id = string.IsNullOrWhiteSpace(allocation.Id) ? Guid.NewGuid().ToString("N") : allocation.Id.Trim(),
                    Account = string.IsNullOrWhiteSpace(allocation.Account) ? string.Empty : allocation.Account.Trim(),
                    Book = string.IsNullOrWhiteSpace(allocation.Book) ? string.Empty : allocation.Book.Trim()
                })
                .ToArray(),
            Activity = (trade.Activity ?? Array.Empty<TradeTicketActivity>())
                .Select(activity => activity with
                {
                    Message = string.IsNullOrWhiteSpace(activity.Message) ? string.Empty : activity.Message,
                    Actor = string.IsNullOrWhiteSpace(activity.Actor) ? "system" : activity.Actor.Trim(),
                    Timestamp = string.IsNullOrWhiteSpace(activity.Timestamp) ? now : activity.Timestamp.Trim()
                })
                .ToArray(),
            CreatedAt = string.IsNullOrWhiteSpace(trade.CreatedAt) ? now : trade.CreatedAt.Trim(),
            UpdatedAt = now
        };
    }

    private static void ValidateWorkflow(WorkflowDefinition workflow)
    {
        if (string.IsNullOrWhiteSpace(workflow.Id))
        {
            throw new InvalidOperationException("Workflow.Id is required.");
        }

        if (string.IsNullOrWhiteSpace(workflow.Name))
        {
            throw new InvalidOperationException("Workflow.Name is required.");
        }

        if (string.IsNullOrWhiteSpace(workflow.CategoryId))
        {
            throw new InvalidOperationException("Workflow.CategoryId is required.");
        }

        if (string.IsNullOrWhiteSpace(workflow.InitialStatus))
        {
            throw new InvalidOperationException("Workflow.InitialStatus is required.");
        }

        var statuses = (workflow.Statuses ?? Array.Empty<WorkflowStatus>()).ToArray();
        if (statuses.Length == 0)
        {
            throw new InvalidOperationException("Workflow.Statuses must contain at least one status.");
        }

        var statusCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var status in statuses)
        {
            if (string.IsNullOrWhiteSpace(status.Code))
            {
                throw new InvalidOperationException("Workflow status codes are required.");
            }

            if (!statusCodes.Add(status.Code))
            {
                throw new InvalidOperationException($"Workflow status '{status.Code}' is duplicated.");
            }

            var actionCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var action in status.Actions ?? Array.Empty<WorkflowAction>())
            {
                if (string.IsNullOrWhiteSpace(action.Code))
                {
                    throw new InvalidOperationException($"Workflow status '{status.Code}' contains an action without a code.");
                }

                if (!actionCodes.Add(action.Code))
                {
                    throw new InvalidOperationException(
                        $"Workflow status '{status.Code}' contains duplicated action code '{action.Code}'.");
                }

                if (string.IsNullOrWhiteSpace(action.TargetStatus))
                {
                    throw new InvalidOperationException(
                        $"Workflow action '{action.Code}' in status '{status.Code}' must specify a target status.");
                }
            }
        }

        if (!statusCodes.Contains(workflow.InitialStatus))
        {
            throw new InvalidOperationException(
                $"Workflow initial status '{workflow.InitialStatus}' does not exist in the workflow.");
        }

        foreach (var action in statuses.SelectMany(status => status.Actions ?? Array.Empty<WorkflowAction>()))
        {
            if (!statusCodes.Contains(action.TargetStatus))
            {
                throw new InvalidOperationException(
                    $"Workflow action '{action.Code}' points to unknown target status '{action.TargetStatus}'.");
            }
        }
    }

    private static string NormalizeRoute(string? rawPath)
    {
        var route = (rawPath ?? "/").TrimEnd('/');
        return string.IsNullOrWhiteSpace(route) ? "/" : route;
    }

    private static APIGatewayHttpApiV2ProxyResponse Ok<T>(T body) =>
        Response(HttpStatusCode.OK, body);

    private static APIGatewayHttpApiV2ProxyResponse Error(HttpStatusCode statusCode, string message) =>
        Response(statusCode, new { error = message });

    private static APIGatewayHttpApiV2ProxyResponse Response<T>(HttpStatusCode statusCode, T body) =>
        new()
        {
            StatusCode = (int)statusCode,
            Headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json"
            },
            Body = JsonSerializer.Serialize(body, JsonOptions)
        };
}
