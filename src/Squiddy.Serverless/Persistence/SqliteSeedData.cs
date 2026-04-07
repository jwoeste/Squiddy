namespace Squiddy.Serverless.Persistence;

public static class SqliteSeedData
{
    public static IReadOnlyList<WorkflowDefinition> SeedWorkflows => new[]
    {
        DefaultWorkflow,
        TradeTicketWorkflow
    };

    public static IReadOnlyList<TradeTicket> SeedTradeTickets => new[]
    {
        new TradeTicket(
            "TRD-20260327-001",
            0,
            "Approved",
            "Cash",
            "Equity",
            "Cash Equity",
            "AAPL.OQ",
            "Buy",
            1000,
            192.44,
            "USD",
            "2026-03-27",
            "2026-03-30",
            "EQ-ARBITRAGE",
            "Index Rebalance",
            "jwoeste",
            "Goldman Sachs",
            "NASDAQ",
            "GSCO",
            "DTC-PRIMARY-USD",
            "Seeded trade for desk validation and approval handling.",
            "DTC",
            "USD-OPERATIONS-01",
            string.Empty,
            null,
            "trade-ticket",
            "TRD-20260327-001",
            1,
            3,
            DefaultChecks,
            new[]
            {
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "FUND-ALPHA", "EQ-ARBITRAGE", 600),
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "FUND-BETA", "EQ-ARBITRAGE", 400)
            },
            new[]
            {
                new TradeTicketActivity("Trade validated by desk controls.", "control", "2026-03-27 09:22"),
                new TradeTicketActivity("Approval completed by supervising trader.", "workflow", "2026-03-27 09:31")
            },
            "2026-03-27T09:15:00.000Z",
            "2026-03-27T09:31:00.000Z"),
        new TradeTicket(
            "TRD-20260327-002",
            0,
            "Pending Approval",
            "Cash",
            "FX",
            "Spot",
            "EUR/USD",
            "Sell",
            5000000,
            1.0821,
            "USD",
            "2026-03-27",
            "2026-03-29",
            "G10-MACRO",
            "Macro Hedge",
            "mchan",
            "JPMorgan",
            "360T",
            "JPM",
            "CLS-USD",
            "Awaiting supervisory approval before downstream release.",
            "CLS",
            "USD-FX-SETTLEMENT",
            string.Empty,
            null,
            "trade-ticket",
            "TRD-20260327-002",
            1,
            2,
            DefaultChecks,
            new[]
            {
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "MACRO-01", "G10-MACRO", 3000000),
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "MACRO-02", "G10-MACRO", 2000000)
            },
            new[]
            {
                new TradeTicketActivity("Ticket captured from FX intake lane.", "workflow", "2026-03-27 08:40"),
                new TradeTicketActivity("Desk sent the trade for approval.", "workflow", "2026-03-27 09:10")
            },
            "2026-03-27T08:40:00.000Z",
            "2026-03-27T09:10:00.000Z"),
        new TradeTicket(
            "TRD-20260327-003",
            0,
            "Validated",
            "Contract / OTC",
            "Rates",
            "IRS",
            "USD 5Y SWAP",
            "Buy",
            25000000,
            99.125,
            "USD",
            "2026-03-27",
            "2026-03-29",
            "RATES-USD",
            "Duration Overlay",
            "arossi",
            string.Empty,
            "Tradeweb",
            "TW",
            string.Empty,
            "Operationally escalated pending settlement completion.",
            string.Empty,
            string.Empty,
            string.Empty,
            "Escalated",
            "trade-ticket",
            "TRD-20260327-003",
            1,
            2,
            new[]
            {
                new TradeTicketCheck("limit", "Limit check", "Desk and portfolio limits are within tolerance.", true),
                new TradeTicketCheck("compliance", "Compliance review", "Restricted list and market abuse checks completed.", true),
                new TradeTicketCheck("settlement", "Settlement ready", "Standing settlement instructions are present.", false),
                new TradeTicketCheck("allocation", "Allocation complete", "Parent ticket quantity matches the allocation breakdown.", false)
            },
            Array.Empty<TradeTicketAllocation>(),
            new[]
            {
                new TradeTicketActivity("Ticket escalated into the exception queue.", "exception", "2026-03-27 08:18")
            },
            "2026-03-27T07:55:00.000Z",
            "2026-03-27T08:18:00.000Z"),
        new TradeTicket(
            "TRD-20260327-004",
            0,
            "Captured",
            "Position",
            "Fund",
            "Position Transfer",
            "MSCI WORLD BASKET",
            "Buy",
            125000,
            1,
            "USD",
            "2026-03-27",
            "2026-03-30",
            "MULTI-ASSET-CORE",
            "Portfolio Rebalance",
            "lthomsen",
            "Northern Trust",
            "Internal Crossing",
            "In House",
            "CUSTODY-POSITION-XFER",
            "Position-based rebalance ticket from a portfolio transition run.",
            "State Street",
            "USD-CUSTODY-01",
            string.Empty,
            null,
            "trade-ticket",
            null,
            1,
            0,
            DefaultChecks,
            new[]
            {
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "PENSION-01", "MULTI-ASSET-CORE", 75000),
                new TradeTicketAllocation(Guid.NewGuid().ToString("N"), "PENSION-02", "MULTI-ASSET-CORE", 50000)
            },
            new[]
            {
                new TradeTicketActivity("Position-based rebalance ticket captured from portfolio transition workflow.", "workflow", "2026-03-27 10:02")
            },
            "2026-03-27T10:02:00.000Z",
            "2026-03-27T10:04:00.000Z")
    };

    private static IReadOnlyList<TradeTicketCheck> DefaultChecks => new[]
    {
        new TradeTicketCheck("limit", "Limit check", "Desk and portfolio limits are within tolerance.", true),
        new TradeTicketCheck("compliance", "Compliance review", "Restricted list and market abuse checks completed.", true),
        new TradeTicketCheck("settlement", "Settlement ready", "Standing settlement instructions are present.", true),
        new TradeTicketCheck("allocation", "Allocation complete", "Parent ticket quantity matches the allocation breakdown.", true)
    };

    public static WorkflowDefinition DefaultWorkflow => new(
        "underwriting",
        0,
        "general",
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

    public static WorkflowDefinition TradeTicketWorkflow => new(
        "trade-ticket",
        0,
        "general",
        "Trade Ticket Workflow",
        "Generic trade ticket lifecycle for capture, approval, booking, and rejection.",
        "Captured",
        new[]
        {
            new WorkflowStatus(
                "Captured",
                "Captured",
                "The trade ticket has been captured and is awaiting validation.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "VALIDATE",
                        "Validate Ticket",
                        "Moves the trade ticket into validated state.",
                        "Validated",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "REJECT",
                        "Reject Ticket",
                        "Rejects the trade ticket from capture.",
                        "Rejected",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "Validated",
                "Validated",
                "The trade ticket has passed desk validation and can move to approval.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "SEND_FOR_APPROVAL",
                        "Send For Approval",
                        "Routes the validated ticket to the approval stage.",
                        "Pending Approval",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "RETURN_TO_CAPTURE",
                        "Return To Capture",
                        "Moves the ticket back to the capture stage.",
                        "Captured",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "REJECT",
                        "Reject Ticket",
                        "Rejects the ticket after validation.",
                        "Rejected",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "Pending Approval",
                "Pending Approval",
                "The trade ticket is waiting for approval.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "APPROVE",
                        "Approve Ticket",
                        "Approves the trade ticket.",
                        "Approved",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "RETURN_TO_VALIDATED",
                        "Return To Validated",
                        "Sends the ticket back to desk validation.",
                        "Validated",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "REJECT",
                        "Reject Ticket",
                        "Rejects the ticket from the approval stage.",
                        "Rejected",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus(
                "Approved",
                "Approved",
                "The trade ticket is approved and ready for booking.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "BOOK",
                        "Book Trade",
                        "Books the approved trade.",
                        "Booked",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>()),
                    new WorkflowAction(
                        "REOPEN_VALIDATION",
                        "Reopen Validation",
                        "Moves the ticket back to validated state for rework.",
                        "Validated",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                }),
            new WorkflowStatus("Booked", "Booked", "The trade has been booked.", true, Array.Empty<WorkflowAction>()),
            new WorkflowStatus(
                "Rejected",
                "Rejected",
                "The trade ticket has been rejected.",
                false,
                new[]
                {
                    new WorkflowAction(
                        "REOPEN",
                        "Reopen Ticket",
                        "Reopens a rejected ticket back into capture.",
                        "Captured",
                        WorkflowActionMode.Manual,
                        Array.Empty<ConditionRule>())
                })
        });
}
