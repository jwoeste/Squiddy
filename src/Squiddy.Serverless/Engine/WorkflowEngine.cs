namespace Squiddy.Serverless;

public sealed class WorkflowEngine
{
    public WorkflowEvaluationResult Evaluate(
        WorkflowDefinition workflow,
        string currentStatusCode,
        IReadOnlyDictionary<string, string?> context)
    {
        var statuses = (workflow.Statuses ?? Array.Empty<WorkflowStatus>())
            .ToDictionary(status => status.Code, StringComparer.OrdinalIgnoreCase);

        if (!statuses.TryGetValue(currentStatusCode, out var currentStatus))
        {
            throw new InvalidOperationException($"Unknown workflow status '{currentStatusCode}'.");
        }

        var availableActions = new List<ActionEvaluation>();
        var appliedActions = new List<AppliedAction>();
        var visitedStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var activeStatus = currentStatus;

        while (true)
        {
            if (!visitedStatuses.Add(activeStatus.Code))
            {
                throw new InvalidOperationException("Detected an STP loop in workflow evaluation.");
            }

            var stpAction = EvaluateStatus(activeStatus, context, availableActions);
            if (stpAction is null)
            {
                break;
            }

            if (!statuses.TryGetValue(stpAction.TargetStatus, out var nextStatus))
            {
                throw new InvalidOperationException(
                    $"Action '{stpAction.Code}' points to unknown target status '{stpAction.TargetStatus}'.");
            }

            appliedActions.Add(new AppliedAction(
                stpAction.Code,
                activeStatus.Code,
                nextStatus.Code,
                AppliedAutomatically: true));

            activeStatus = nextStatus;
        }

        return new WorkflowEvaluationResult(
            workflow.Id,
            currentStatus.Code,
            activeStatus.Code,
            availableActions,
            appliedActions);
    }

    private static WorkflowAction? EvaluateStatus(
        WorkflowStatus status,
        IReadOnlyDictionary<string, string?> context,
        List<ActionEvaluation> availableActions)
    {
        WorkflowAction? firstMatchingStpAction = null;

        foreach (var action in status.Actions ?? Array.Empty<WorkflowAction>())
        {
            var conditionsMet = (action.Conditions ?? Array.Empty<ConditionRule>())
                .All(rule => EvaluateRule(rule, context));

            availableActions.Add(new ActionEvaluation(
                action.Code,
                action.Name,
                action.TargetStatus,
                action.IsStraightThroughProcessing,
                conditionsMet));

            if (firstMatchingStpAction is null && action.IsStraightThroughProcessing && conditionsMet)
            {
                firstMatchingStpAction = action;
            }
        }

        return firstMatchingStpAction;
    }

    private static bool EvaluateRule(ConditionRule rule, IReadOnlyDictionary<string, string?> context)
    {
        var exists = context.TryGetValue(rule.Key, out var actualValue);

        return rule.Operator switch
        {
            ConditionOperator.Equals => exists && string.Equals(actualValue, rule.ExpectedValue, StringComparison.OrdinalIgnoreCase),
            ConditionOperator.NotEquals => !exists || !string.Equals(actualValue, rule.ExpectedValue, StringComparison.OrdinalIgnoreCase),
            ConditionOperator.Exists => exists && !string.IsNullOrWhiteSpace(actualValue),
            ConditionOperator.Missing => !exists || string.IsNullOrWhiteSpace(actualValue),
            _ => throw new InvalidOperationException($"Unsupported operator '{rule.Operator}'.")
        };
    }
}
