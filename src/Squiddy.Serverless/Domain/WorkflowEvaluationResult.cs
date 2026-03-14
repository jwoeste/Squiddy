namespace Squiddy.Serverless;

public sealed record WorkflowEvaluationResult(
    string WorkflowId,
    string StartingStatus,
    string FinalStatus,
    IReadOnlyList<ActionEvaluation> AvailableActions,
    IReadOnlyList<AppliedAction> AppliedActions);

public sealed record ActionEvaluation(
    string ActionCode,
    string ActionName,
    string TargetStatus,
    bool IsStraightThroughProcessing,
    bool ConditionsMet);

public sealed record AppliedAction(
    string ActionCode,
    string FromStatus,
    string ToStatus,
    bool AppliedAutomatically);
