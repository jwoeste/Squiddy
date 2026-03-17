namespace Squiddy.Serverless;

public sealed record WorkflowCategory(
    string Id,
    string Name,
    string? Description,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
