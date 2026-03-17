namespace Squiddy.Serverless;

public sealed record WorkflowDefinition(
    string Id,
    int Version,
    string CategoryId,
    string Name,
    string? Description,
    string InitialStatus,
    IReadOnlyList<WorkflowStatus>? Statuses);

public sealed record WorkflowStatus(
    string Code,
    string Name,
    string? Description,
    bool IsTerminal,
    IReadOnlyList<WorkflowAction>? Actions);

public sealed record WorkflowAction(
    string Code,
    string Name,
    string? Description,
    string TargetStatus,
    WorkflowActionMode Mode,
    IReadOnlyList<ConditionRule>? Conditions);

public enum WorkflowActionMode
{
    Manual,
    Automatic
}

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
