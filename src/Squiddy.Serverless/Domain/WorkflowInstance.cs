namespace Squiddy.Serverless;

public sealed record WorkflowInstance(
    string Id,
    string WorkflowId,
    string CurrentStatus,
    IReadOnlyDictionary<string, string?> Context,
    WorkflowEvaluationResult? LastEvaluation,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
