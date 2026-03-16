namespace Squiddy.Serverless.Contracts;

public sealed record SaveWorkflowDefinitionRequest(
    WorkflowDefinition Workflow,
    int? ExpectedVersion = null);
