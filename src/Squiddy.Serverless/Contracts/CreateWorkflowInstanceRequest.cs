namespace Squiddy.Serverless.Contracts;

public sealed record CreateWorkflowInstanceRequest(
    string WorkflowId,
    string? InstanceId,
    Dictionary<string, string?>? Context,
    string? TriggerSource = null,
    string? ActorId = null,
    string? CorrelationId = null);
