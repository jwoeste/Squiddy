namespace Squiddy.Serverless.Contracts;

public sealed record SaveWorkflowCategoryRequest(
    WorkflowCategory Category,
    string? OriginalCategoryId = null);
