namespace Squiddy.Serverless.Persistence;

public static class SqliteSeedData
{
    public static WorkflowDefinition DefaultWorkflow => new(
        "underwriting",
        "Underwriting Workflow",
        new[]
        {
            new WorkflowStatus(
                "Draft",
                "Draft",
                new[]
                {
                    new WorkflowAction(
                        "SUBMIT",
                        "Submit Application",
                        "Submitted",
                        false,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "Submitted",
                "Submitted",
                new[]
                {
                    new WorkflowAction(
                        "AUTO_APPROVE",
                        "Auto Approve",
                        "Approved",
                        true,
                        new[]
                        {
                            new ConditionRule("riskScore", ConditionOperator.Equals, "LOW"),
                            new ConditionRule("documentsComplete", ConditionOperator.Equals, "true")
                        }),
                    new WorkflowAction(
                        "REFER",
                        "Refer to Underwriter",
                        "InReview",
                        false,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "InReview",
                "In Review",
                new[]
                {
                    new WorkflowAction(
                        "APPROVE",
                        "Approve",
                        "Approved",
                        false,
                        new[]
                        {
                            new ConditionRule("underwriterDecision", ConditionOperator.Equals, "approve")
                        }),
                    new WorkflowAction(
                        "DECLINE",
                        "Decline",
                        "Declined",
                        false,
                        new[]
                        {
                            new ConditionRule("underwriterDecision", ConditionOperator.Equals, "decline")
                        })
                }),
            new WorkflowStatus("Approved", "Approved", Array.Empty<WorkflowAction>()),
            new WorkflowStatus("Declined", "Declined", Array.Empty<WorkflowAction>())
        });
}
