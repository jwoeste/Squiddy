namespace Squiddy.Serverless;

public sealed class WorkflowEngine
{
    public WorkflowEvaluationResult Evaluate(
        WorkflowDefinition workflow,
        string currentStatusCode,
        IReadOnlyDictionary<string, string?> context)
    {
        return EvaluateInternal(workflow, currentStatusCode, context, manualActionCode: null);
    }

    public WorkflowEvaluationResult ExecuteManualCommand(
        WorkflowDefinition workflow,
        string currentStatusCode,
        string commandCode,
        IReadOnlyDictionary<string, string?> context)
    {
        if (string.IsNullOrWhiteSpace(commandCode))
        {
            throw new InvalidOperationException("CommandCode is required.");
        }

        return EvaluateInternal(workflow, currentStatusCode, context, commandCode);
    }

    private static WorkflowEvaluationResult EvaluateInternal(
        WorkflowDefinition workflow,
        string currentStatusCode,
        IReadOnlyDictionary<string, string?> context,
        string? manualActionCode)
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

        if (!string.IsNullOrWhiteSpace(manualActionCode))
        {
            var manualAction = EvaluateStatus(activeStatus, context, availableActions)
                .SingleOrDefault(action => string.Equals(action.Code, manualActionCode, StringComparison.OrdinalIgnoreCase));

            if (manualAction is null)
            {
                throw new InvalidOperationException(
                    $"Command '{manualActionCode}' is not available from status '{activeStatus.Code}'.");
            }

            if (manualAction.Mode != WorkflowActionMode.Manual)
            {
                throw new InvalidOperationException(
                    $"Command '{manualAction.Code}' cannot be invoked manually.");
            }

            if (!statuses.TryGetValue(manualAction.TargetStatus, out var nextStatus))
            {
                throw new InvalidOperationException(
                    $"Action '{manualAction.Code}' points to unknown target status '{manualAction.TargetStatus}'.");
            }

            appliedActions.Add(new AppliedAction(
                manualAction.Code,
                manualAction.Name,
                activeStatus.Code,
                nextStatus.Code,
                AppliedAutomatically: false));

            activeStatus = nextStatus;
        }

        while (true)
        {
            if (!visitedStatuses.Add(activeStatus.Code))
            {
                throw new InvalidOperationException("Detected an automatic transition loop in workflow evaluation.");
            }

            var automaticAction = EvaluateStatus(activeStatus, context, availableActions)
                .FirstOrDefault(action => action.Mode == WorkflowActionMode.Automatic);

            if (automaticAction is null)
            {
                break;
            }

            if (!statuses.TryGetValue(automaticAction.TargetStatus, out var nextStatus))
            {
                throw new InvalidOperationException(
                    $"Action '{automaticAction.Code}' points to unknown target status '{automaticAction.TargetStatus}'.");
            }

            appliedActions.Add(new AppliedAction(
                automaticAction.Code,
                automaticAction.Name,
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

    private static IReadOnlyList<WorkflowAction> EvaluateStatus(
        WorkflowStatus status,
        IReadOnlyDictionary<string, string?> context,
        List<ActionEvaluation> availableActions)
    {
        var matchingActions = new List<WorkflowAction>();

        foreach (var action in status.Actions ?? Array.Empty<WorkflowAction>())
        {
            var conditionsMet = (action.Conditions ?? Array.Empty<ConditionRule>())
                .All(rule => EvaluateRule(rule, context));

            availableActions.Add(new ActionEvaluation(
                action.Code,
                action.Name,
                action.TargetStatus,
                action.Mode,
                conditionsMet));

            if (conditionsMet)
            {
                matchingActions.Add(action);
            }
        }

        return matchingActions;
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
