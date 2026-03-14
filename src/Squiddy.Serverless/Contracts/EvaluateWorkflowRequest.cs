namespace Squiddy.Serverless.Contracts;

public sealed record EvaluateWorkflowRequest(
    WorkflowDefinition Workflow,
    string CurrentStatus,
    Dictionary<string, string?>? Context);
