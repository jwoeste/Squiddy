namespace Squiddy.Serverless;

public sealed record WorkflowVersionInfo(
    string WorkflowId,
    int Version,
    string Name,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int InstanceCount,
    bool IsLatest);
