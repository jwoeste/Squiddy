namespace Squiddy.Serverless;

public sealed record WorkflowAuditTransaction(
    string TransactionId,
    string InstanceId,
    string WorkflowId,
    string TriggerSource,
    string? ActorId,
    string? CorrelationId,
    string StartingStatus,
    string FinalStatus,
    IReadOnlyDictionary<string, string?> ContextSnapshot,
    WorkflowEvaluationResult Evaluation,
    DateTimeOffset CreatedAt,
    IReadOnlyList<WorkflowAuditEntry> Entries);

public sealed record WorkflowAuditEntry(
    string EntryId,
    string TransactionId,
    int Sequence,
    string ActionCode,
    string FromStatus,
    string ToStatus,
    bool AppliedAutomatically,
    DateTimeOffset CreatedAt);
