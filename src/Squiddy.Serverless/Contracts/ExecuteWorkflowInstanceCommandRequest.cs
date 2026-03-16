namespace Squiddy.Serverless.Contracts;

public sealed record ExecuteWorkflowInstanceCommandRequest(
    string CommandCode,
    int ExpectedVersion,
    Dictionary<string, string?>? Context,
    string? TriggerSource = null,
    string? ActorId = null,
    string? CorrelationId = null);
