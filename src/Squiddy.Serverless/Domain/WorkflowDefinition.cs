namespace Squiddy.Serverless;

public sealed record WorkflowDefinition(
    string Id,
    string Name,
    IReadOnlyList<WorkflowStatus>? Statuses);

public sealed record WorkflowStatus(
    string Code,
    string Name,
    IReadOnlyList<WorkflowAction>? Actions);

public sealed record WorkflowAction(
    string Code,
    string Name,
    string TargetStatus,
    bool IsStraightThroughProcessing,
    IReadOnlyList<ConditionRule>? Conditions);

public sealed record ConditionRule(
    string Key,
    ConditionOperator Operator,
    string? ExpectedValue);

public enum ConditionOperator
{
    Equals,
    NotEquals,
    Exists,
    Missing
}
