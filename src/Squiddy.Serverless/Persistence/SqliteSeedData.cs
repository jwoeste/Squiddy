namespace Squiddy.Serverless.Persistence;

public static class SqliteSeedData
{
    public static WorkflowDefinition DefaultWorkflow => new(
        "underwriting",
        0,
        "Underwriting Workflow",
        "Sample underwriting process with automatic approval and manual review.",
        "Draft",
        new[]
        {
            new WorkflowStatus(
                "Draft",
                "Draft",
                "Application is being assembled.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "SUBMIT",
                        "Submit Application",
                        "Moves the application into submitted state.",
                        "Submitted",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "Submitted",
                "Submitted",
                "The application has been submitted and awaits automated rules or referral.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "AUTO_APPROVE",
                        "Auto Approve",
                        "Automatically approves low-risk complete applications.",
                        "Approved",
                        WorkflowActionMode.Automatic,
                        new[]
                        {
                            new ConditionRule("riskScore", ConditionOperator.Equals, "LOW"),
                            new ConditionRule("documentsComplete", ConditionOperator.Equals, "true")
                        }),
                    new WorkflowAction(
                        "REFER",
                        "Refer to Underwriter",
                        "Sends the application to manual review.",
                        "InReview",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "InReview",
                "In Review",
                "An underwriter is reviewing the application.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "APPROVE",
                        "Approve",
                        "Approves the application after review.",
                        "Approved",
                        WorkflowActionMode.Manual,
                        new[]
                        {
                            new ConditionRule("underwriterDecision", ConditionOperator.Equals, "approve")
                        }),
                    new WorkflowAction(
                        "DECLINE",
                        "Decline",
                        "Declines the application after review.",
                        "Declined",
                        WorkflowActionMode.Manual,
                        new[]
                        {
                            new ConditionRule("underwriterDecision", ConditionOperator.Equals, "decline")
                        })
                }),
            new WorkflowStatus("Approved", "Approved", "The application has been approved.", true, Array.Empty<WorkflowAction>()),
            new WorkflowStatus("Declined", "Declined", "The application has been declined.", true, Array.Empty<WorkflowAction>())
        });
}
