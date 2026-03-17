namespace Squiddy.Serverless.Contracts;

public sealed record RollbackWorkflowVersionRequest(
    int TargetVersion);
