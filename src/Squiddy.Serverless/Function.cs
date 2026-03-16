using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Microsoft.Data.Sqlite;
using Squiddy.Serverless.Contracts;
using Squiddy.Serverless.Persistence;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace Squiddy.Serverless;

public class Function
{
    private static readonly JsonSerializerOptions JsonOptions = SqliteJson.SerializerOptions;
    private static readonly SqliteOptions DatabaseOptions = new();
    private static readonly SqliteConnectionFactory ConnectionFactory = new(DatabaseOptions);
    private static readonly SqliteDatabaseInitializer DatabaseInitializer = new(ConnectionFactory);
    private static readonly Task InitializationTask = DatabaseInitializer.InitializeAsync(SqliteSeedData.DefaultWorkflow);

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
        await using var connection = ConnectionFactory.CreateConnection();
        await connection.OpenAsync();

        var workflowRepository = new SqliteWorkflowDefinitionRepository(connection);
        var workflowInstanceRepository = new SqliteWorkflowInstanceRepository(connection);
        var workflowAuditRepository = new SqliteWorkflowAuditRepository(connection);

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
                    "GET /workflows/{workflowId}",
                    "POST /workflows",
                    "DELETE /workflows/{workflowId}",
                    "POST /workflows/evaluate",
                    "GET /workflow-instances",
                    "POST /workflow-instances",
                    "POST /workflow-instances/{instanceId}/commands",
                    "GET /workflow-instances/{instanceId}",
                    "GET /workflow-instances/{instanceId}/audit-trail"
                }
            });
        }

        if (method == "GET" && route == "/workflows")
        {
            return Ok(await workflowRepository.ListAsync());
        }

        if (method == "POST" && route == "/workflows")
        {
            return await SaveWorkflowAsync(request, workflowRepository);
        }

        if (method == "DELETE" && segments.Length == 2 && segments[0] == "workflows")
        {
            return await DeleteWorkflowAsync(connection, segments[1], workflowRepository, workflowInstanceRepository, workflowAuditRepository);
        }

        if (method == "POST" && route == "/workflows/evaluate")
        {
            return await EvaluateWorkflowDefinitionAsync(request);
        }

        if (method == "POST" && route == "/workflow-instances")
        {
            return await CreateWorkflowInstanceAsync(request, connection, workflowRepository, workflowInstanceRepository, workflowAuditRepository);
        }

        if (method == "POST" && segments.Length == 3 && segments[0] == "workflow-instances" && segments[2] == "commands")
        {
            return await ExecuteWorkflowInstanceCommandAsync(
                request,
                connection,
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

        if (method == "GET" && segments.Length == 3 && segments[0] == "workflow-instances" && segments[2] == "audit-trail")
        {
            return Ok(await workflowAuditRepository.ListByInstanceAsync(segments[1]));
        }

        return Error(HttpStatusCode.NotFound, "Route not found.");
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> SaveWorkflowAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        SqliteWorkflowDefinitionRepository workflowRepository)
    {
        var payload = DeserializeBody<SaveWorkflowDefinitionRequest>(request.Body);
        if (payload.Workflow is null)
        {
            throw new InvalidOperationException("Workflow is required.");
        }

        var workflow = NormalizeWorkflow(payload.Workflow);
        ValidateWorkflow(workflow);
        var savedWorkflow = await workflowRepository.SaveAsync(workflow, payload.ExpectedVersion);

        return Response(payload.ExpectedVersion is null ? HttpStatusCode.Created : HttpStatusCode.OK, savedWorkflow);
    }

    private async Task<APIGatewayHttpApiV2ProxyResponse> GetWorkflowAsync(
        string workflowId,
        SqliteWorkflowDefinitionRepository workflowRepository)
    {
        var workflow = await workflowRepository.GetAsync(workflowId);
        return workflow is null
            ? Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.")
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
        SqliteConnection connection,
        string workflowId,
        SqliteWorkflowDefinitionRepository workflowRepository,
        SqliteWorkflowInstanceRepository workflowInstanceRepository,
        SqliteWorkflowAuditRepository workflowAuditRepository)
    {
        var existingWorkflow = await workflowRepository.GetAsync(workflowId);
        if (existingWorkflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{workflowId}' was not found.");
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();
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

    private async Task<APIGatewayHttpApiV2ProxyResponse> CreateWorkflowInstanceAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        SqliteConnection connection,
        SqliteWorkflowDefinitionRepository workflowRepository,
        SqliteWorkflowInstanceRepository workflowInstanceRepository,
        SqliteWorkflowAuditRepository workflowAuditRepository)
    {
        var payload = DeserializeBody<CreateWorkflowInstanceRequest>(request.Body);

        if (string.IsNullOrWhiteSpace(payload.WorkflowId))
        {
            throw new InvalidOperationException("WorkflowId is required.");
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();

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
        SqliteConnection connection,
        string instanceId,
        SqliteWorkflowDefinitionRepository workflowRepository,
        SqliteWorkflowInstanceRepository workflowInstanceRepository,
        SqliteWorkflowAuditRepository workflowAuditRepository)
    {
        var payload = DeserializeBody<ExecuteWorkflowInstanceCommandRequest>(request.Body);

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();

        var existingInstance = await workflowInstanceRepository.GetAsync(instanceId, transaction);
        if (existingInstance is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow instance '{instanceId}' was not found.");
        }

        var workflow = await workflowRepository.GetAsync(existingInstance.WorkflowId, transaction);
        if (workflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{existingInstance.WorkflowId}' was not found.");
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
        SqliteWorkflowInstanceRepository workflowInstanceRepository)
    {
        var instance = await workflowInstanceRepository.GetAsync(instanceId);
        return instance is null
            ? Error(HttpStatusCode.NotFound, $"Workflow instance '{instanceId}' was not found.")
            : Ok(instance);
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
        workflow with
        {
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
        };

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
