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
                    "POST /workflow-instances/evaluate",
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
            return await EvaluateWorkflowDefinitionAsync(request, workflowRepository);
        }

        if (method == "POST" && route == "/workflow-instances/evaluate")
        {
            return await EvaluateWorkflowInstanceAsync(request, connection, workflowRepository, workflowInstanceRepository, workflowAuditRepository);
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

        ValidateWorkflow(payload.Workflow);
        var workflow = NormalizeWorkflow(payload.Workflow);
        await workflowRepository.UpsertAsync(workflow);

        return Response(HttpStatusCode.Created, workflow);
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

    private async Task<APIGatewayHttpApiV2ProxyResponse> EvaluateWorkflowDefinitionAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        SqliteWorkflowDefinitionRepository workflowRepository)
    {
        var payload = DeserializeBody<EvaluateWorkflowRequest>(request.Body);
        var workflow = payload.Workflow;

        if (workflow is null)
        {
            throw new InvalidOperationException("Workflow is required.");
        }

        ValidateWorkflow(workflow);

        if (string.IsNullOrWhiteSpace(payload.CurrentStatus))
        {
            throw new InvalidOperationException("CurrentStatus is required.");
        }

        if (!string.IsNullOrWhiteSpace(workflow.Id))
        {
            await workflowRepository.UpsertAsync(NormalizeWorkflow(workflow));
        }

        var result = _workflowEngine.Evaluate(
            NormalizeWorkflow(workflow),
            payload.CurrentStatus,
            payload.Context ?? new Dictionary<string, string?>());

        return Ok(result);
    }

    private static async Task<APIGatewayHttpApiV2ProxyResponse> DeleteWorkflowAsync(
        Microsoft.Data.Sqlite.SqliteConnection connection,
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

        await using var transaction = (Microsoft.Data.Sqlite.SqliteTransaction)await connection.BeginTransactionAsync();
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

    private async Task<APIGatewayHttpApiV2ProxyResponse> EvaluateWorkflowInstanceAsync(
        APIGatewayHttpApiV2ProxyRequest request,
        Microsoft.Data.Sqlite.SqliteConnection connection,
        SqliteWorkflowDefinitionRepository workflowRepository,
        SqliteWorkflowInstanceRepository workflowInstanceRepository,
        SqliteWorkflowAuditRepository workflowAuditRepository)
    {
        var payload = DeserializeBody<EvaluateWorkflowInstanceRequest>(request.Body);

        if (string.IsNullOrWhiteSpace(payload.WorkflowId))
        {
            throw new InvalidOperationException("WorkflowId is required.");
        }

        if (string.IsNullOrWhiteSpace(payload.CurrentStatus))
        {
            throw new InvalidOperationException("CurrentStatus is required.");
        }

        await using var transaction = (Microsoft.Data.Sqlite.SqliteTransaction)await connection.BeginTransactionAsync();

        var workflow = await workflowRepository.GetAsync(payload.WorkflowId, transaction);
        if (workflow is null)
        {
            return Error(HttpStatusCode.NotFound, $"Workflow '{payload.WorkflowId}' was not found.");
        }

        var result = _workflowEngine.Evaluate(
            workflow,
            payload.CurrentStatus,
            payload.Context ?? new Dictionary<string, string?>());

        var now = DateTimeOffset.UtcNow;
        var instanceId = string.IsNullOrWhiteSpace(payload.InstanceId) ? Guid.NewGuid().ToString("N") : payload.InstanceId;
        var instance = new WorkflowInstance(
            instanceId,
            workflow.Id,
            result.FinalStatus,
            payload.Context ?? new Dictionary<string, string?>(),
            result,
            now,
            now);

        var existingInstance = await workflowInstanceRepository.GetAsync(instance.Id, transaction);
        if (existingInstance is not null)
        {
            instance = instance with { CreatedAt = existingInstance.CreatedAt };
        }

        var auditTransaction = BuildAuditTransaction(payload, instance, result, now);

        await workflowInstanceRepository.UpsertAsync(instance, transaction);
        await workflowAuditRepository.AppendTransactionAsync(auditTransaction, transaction);
        await transaction.CommitAsync();

        return Ok(new
        {
            instance,
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
        EvaluateWorkflowInstanceRequest payload,
        WorkflowInstance instance,
        WorkflowEvaluationResult result,
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
            string.IsNullOrWhiteSpace(payload.TriggerSource) ? "workflow-instance-evaluate" : payload.TriggerSource,
            payload.ActorId,
            payload.CorrelationId,
            result.StartingStatus,
            result.FinalStatus,
            new Dictionary<string, string?>(instance.Context),
            result,
            createdAt,
            entries);
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
