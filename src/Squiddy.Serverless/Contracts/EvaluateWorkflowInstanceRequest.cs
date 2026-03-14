namespace Squiddy.Serverless.Contracts;

public sealed record EvaluateWorkflowInstanceRequest(
    string WorkflowId,
    string? InstanceId,
    string CurrentStatus,
    Dictionary<string, string?>? Context,
    string? TriggerSource = null,
    string? ActorId = null,
    string? CorrelationId = null);
