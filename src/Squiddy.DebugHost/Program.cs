using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Primitives;
using Squiddy.Serverless;
using Squiddy.Serverless.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var app = builder.Build();

app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        if (!context.Context.Request.Path.StartsWithSegments("/dashboard"))
        {
            return;
        }

        context.Context.Response.Headers.CacheControl = new StringValues("no-store, no-cache, must-revalidate");
        context.Context.Response.Headers.Pragma = new StringValues("no-cache");
        context.Context.Response.Headers.Expires = new StringValues("0");
    }
});
app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/dashboard", () => TypedResults.Redirect("/dashboard/index.html"))
    .ExcludeFromDescription();

app.MapGet("/", async Task<IResult> () =>
        await InvokeLambdaAsync("GET", "/"))
    .WithName("GetServiceInfo")
    .WithSummary("Returns service metadata from the Lambda workflow engine.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json");

app.MapGet("/workflows", async Task<IResult> () =>
        await InvokeLambdaAsync("GET", "/workflows"))
    .WithName("ListWorkflows")
    .WithSummary("Lists workflow definitions stored in SQLite.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json");

app.MapGet("/workflow-categories", async Task<IResult> () =>
        await InvokeLambdaAsync("GET", "/workflow-categories"))
    .WithName("ListWorkflowCategories")
    .WithSummary("Lists workflow categories stored in SQLite.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json");

app.MapGet("/diagnostics/storage", async Task<IResult> () =>
        await InvokeLambdaAsync("GET", "/diagnostics/storage"))
    .WithName("GetStorageDiagnostics")
    .WithSummary("Returns the active SQLite path plus key table/column diagnostics for local debugging.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json");

app.MapGet("/workflows/{workflowId}", async Task<IResult> (string workflowId) =>
        await InvokeLambdaNotFoundAsync("GET", $"/workflows/{workflowId}", $"Workflow '{workflowId}' was not found."))
    .WithName("GetWorkflow")
    .WithSummary("Returns one workflow definition from SQLite.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status404NotFound);

app.MapGet("/workflows/{workflowId}/versions", async Task<IResult> (string workflowId) =>
        await InvokeLambdaNotFoundAsync("GET", $"/workflows/{workflowId}/versions", $"Workflow '{workflowId}' was not found."))
    .WithName("ListWorkflowVersions")
    .WithSummary("Lists all persisted versions for a workflow definition.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status404NotFound);

app.MapGet("/workflows/{workflowId}/versions/{version:int}", async Task<IResult> (string workflowId, int version) =>
        await InvokeLambdaNotFoundAsync("GET", $"/workflows/{workflowId}/versions/{version}", $"Workflow '{workflowId}' version {version} was not found."))
    .WithName("GetWorkflowVersion")
    .WithSummary("Returns a specific persisted workflow definition version.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/workflows", async Task<IResult> (HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", "/workflows", request))
    .WithName("SaveWorkflow")
    .WithSummary("Creates or updates a workflow definition with optimistic version checks.")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created, contentType: "application/json")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status409Conflict);

app.MapPost("/workflow-categories", async Task<IResult> (HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", "/workflow-categories", request))
    .WithName("SaveWorkflowCategory")
    .WithSummary("Creates or updates a workflow category.")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest);

app.MapPost("/workflows/{workflowId}/rollback", async Task<IResult> (string workflowId, HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", $"/workflows/{workflowId}/rollback", request))
    .WithName("RollbackWorkflow")
    .WithSummary("Deletes newer workflow versions so an older revision becomes current again when safe.")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

app.MapDelete("/workflows/{workflowId}", async Task<IResult> (string workflowId) =>
        await InvokeLambdaNotFoundAsync("DELETE", $"/workflows/{workflowId}", $"Workflow '{workflowId}' was not found."))
    .WithName("DeleteWorkflow")
    .WithSummary("Deletes a workflow definition and any persisted instance activity tied to it.")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

app.MapDelete("/workflow-categories/{categoryId}", async Task<IResult> (string categoryId) =>
        await InvokeLambdaNotFoundAsync("DELETE", $"/workflow-categories/{categoryId}", $"Workflow category '{categoryId}' was not found."))
    .WithName("DeleteWorkflowCategory")
    .WithSummary("Deletes a workflow category when it is no longer referenced.")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/workflows/evaluate", async Task<IResult> (HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", "/workflows/evaluate", request))
    .WithName("EvaluateWorkflow")
    .WithSummary("Evaluates a workflow definition and auto-applies matching STP actions.")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest);

app.MapGet("/workflow-instances", async Task<IResult> () =>
        await InvokeLambdaAsync("GET", "/workflow-instances"))
    .WithName("ListWorkflowInstances")
    .WithSummary("Lists persisted workflow instance activity from SQLite.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json");

app.MapGet("/workflow-instances/{instanceId}/audit-trail", async Task<IResult> (string instanceId) =>
        await InvokeLambdaAsync("GET", $"/workflow-instances/{instanceId}/audit-trail"))
    .WithName("GetWorkflowInstanceAuditTrail")
    .WithSummary("Returns the transactional audit trail for a workflow instance.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/workflow-instances", async Task<IResult> (HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", "/workflow-instances", request))
    .WithName("CreateWorkflowInstance")
    .WithSummary("Creates a workflow instance from the workflow's initial status and applies automatic transitions.")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/workflow-instances/{instanceId}/commands", async Task<IResult> (string instanceId, HttpRequest request) =>
        await InvokeLambdaWithRawBodyAsync("POST", $"/workflow-instances/{instanceId}/commands", request))
    .WithName("ExecuteWorkflowInstanceCommand")
    .WithSummary("Applies a manual workflow command with optimistic version checks, then runs any automatic transitions.")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound)
    .Produces(StatusCodes.Status409Conflict);

app.MapGet("/workflow-instances/{instanceId}", async Task<IResult> (string instanceId) =>
        await InvokeLambdaNotFoundAsync("GET", $"/workflow-instances/{instanceId}", $"Workflow instance '{instanceId}' was not found."))
    .WithName("GetWorkflowInstance")
    .WithSummary("Returns persisted workflow instance state from SQLite.")
    .Produces(StatusCodes.Status200OK, contentType: "application/json")
    .Produces(StatusCodes.Status404NotFound);

// Force the Lambda initializer to run before the dashboard starts issuing requests.
await InvokeFunctionAsync("GET", "/");

app.Run();

static async Task<IResult> InvokeLambdaNotFoundAsync(
    string method,
    string path,
    string notFoundMessage)
{
    var response = await InvokeFunctionAsync(method, path);
    return response.StatusCode == StatusCodes.Status404NotFound
        ? TypedResults.NotFound(notFoundMessage)
        : ToContentResult(response);
}

static async Task<IResult> InvokeLambdaWithRawBodyAsync(string method, string path, HttpRequest request)
{
    using var reader = new StreamReader(request.Body, Encoding.UTF8);
    var body = await reader.ReadToEndAsync();
    return ToContentResult(await InvokeFunctionAsync(method, path, body));
}

static async Task<IResult> InvokeLambdaAsync(string method, string path) =>
    ToContentResult(await InvokeFunctionAsync(method, path));

static async Task<APIGatewayHttpApiV2ProxyResponse> InvokeFunctionAsync(string method, string path, string? body = null)
{
    var function = new Function();
    var lambdaRequest = new APIGatewayHttpApiV2ProxyRequest
    {
        RawPath = path,
        Body = body,
        RequestContext = new APIGatewayHttpApiV2ProxyRequest.ProxyRequestContext
        {
            Http = new APIGatewayHttpApiV2ProxyRequest.HttpDescription
            {
                Method = method,
                Path = path,
                SourceIp = "127.0.0.1",
                UserAgent = "Squiddy.DebugHost"
            },
            RequestId = Guid.NewGuid().ToString("N"),
            Stage = "$default"
        }
    };

    return await function.FunctionHandler(lambdaRequest, new LocalLambdaContext());
}

static IResult ToContentResult(APIGatewayHttpApiV2ProxyResponse response)
{
    var contentType = response.Headers?.TryGetValue("Content-Type", out var headerValue) == true
        ? headerValue
        : "application/json";

    return Results.Content(
        response.Body ?? string.Empty,
        contentType,
        Encoding.UTF8,
        response.StatusCode);
}

internal sealed class LocalLambdaContext : ILambdaContext
{
    public string AwsRequestId { get; } = Guid.NewGuid().ToString("N");
    public IClientContext ClientContext => null!;
    public string FunctionName => "Squiddy.DebugHost";
    public string FunctionVersion => "local";
    public ICognitoIdentity Identity => null!;
    public string InvokedFunctionArn => "local";
    public ILambdaLogger Logger { get; } = new LocalLambdaLogger();
    public string LogGroupName => "local";
    public string LogStreamName => "local";
    public int MemoryLimitInMB => 512;
    public TimeSpan RemainingTime => TimeSpan.FromMinutes(5);
}

internal sealed class LocalLambdaLogger : ILambdaLogger
{
    public void Log(string message) => Console.Write(message);
    public void LogLine(string message) => Console.WriteLine(message);
}
