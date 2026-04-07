const TRADE_WORKFLOW_ID = "trade-ticket";
const LIFECYCLE = ["Captured", "Validated", "Pending Approval", "Approved", "Booked"];
const WORKFLOW_REPLAY_BY_STATUS = {
    "Captured": [],
    "Validated": ["VALIDATE"],
    "Pending Approval": ["VALIDATE", "SEND_FOR_APPROVAL"],
    "Approved": ["VALIDATE", "SEND_FOR_APPROVAL", "APPROVE"],
    "Booked": ["VALIDATE", "SEND_FOR_APPROVAL", "APPROVE", "BOOK"],
    "Rejected": ["REJECT"]
};
const WORKFLOW_COMMAND_METADATA = {
    VALIDATE: {
        buttonLabel: "Validate Ticket",
        variant: "normal"
    },
    SEND_FOR_APPROVAL: {
        buttonLabel: "Submit For Approval",
        variant: "normal"
    },
    APPROVE: {
        buttonLabel: "Approve",
        variant: "normal"
    },
    BOOK: {
        buttonLabel: "Book Trade",
        variant: "normal"
    },
    RETURN_TO_CAPTURE: {
        buttonLabel: "Return To Capture",
        variant: "warning"
    },
    RETURN_TO_VALIDATED: {
        buttonLabel: "Send Back",
        variant: "warning"
    },
    REOPEN_VALIDATION: {
        buttonLabel: "Reopen Validation",
        variant: "warning"
    },
    REJECT: {
        buttonLabel: "Reject",
        variant: "warning"
    },
    REOPEN: {
        buttonLabel: "Reopen Draft",
        variant: "normal"
    }
};
const TRADE_ACTION_POLICY_BY_STATUS = {
    "Captured": {
        editTradeDetails: true,
        editOperationsFields: true,
        editWorkflowNote: true,
        editChecks: true,
        editAllocations: true,
        saveTrade: true,
        escalate: true,
        duplicate: true
    },
    "Validated": {
        editTradeDetails: false,
        editOperationsFields: true,
        editWorkflowNote: true,
        editChecks: true,
        editAllocations: true,
        saveTrade: true,
        escalate: true,
        duplicate: true
    },
    "Pending Approval": {
        editTradeDetails: false,
        editOperationsFields: false,
        editWorkflowNote: true,
        editChecks: false,
        editAllocations: false,
        saveTrade: false,
        escalate: true,
        duplicate: true
    },
    "Approved": {
        editTradeDetails: false,
        editOperationsFields: true,
        editWorkflowNote: true,
        editChecks: true,
        editAllocations: true,
        saveTrade: true,
        escalate: true,
        duplicate: true
    },
    "Booked": {
        editTradeDetails: false,
        editOperationsFields: false,
        editWorkflowNote: false,
        editChecks: false,
        editAllocations: false,
        saveTrade: false,
        escalate: true,
        duplicate: true
    },
    "Rejected": {
        editTradeDetails: false,
        editOperationsFields: false,
        editWorkflowNote: true,
        editChecks: false,
        editAllocations: false,
        saveTrade: false,
        escalate: false,
        duplicate: true
    }
};

const tradeStore = window.SquiddyTradeStore;
const requestedTicketId = new URLSearchParams(window.location.search).get("ticketId");
const storedTrade = requestedTicketId ? tradeStore.getTrade(requestedTicketId) : null;
const tradeState = storedTrade ?? tradeStore.loadDraft();
let tradeWorkflowDefinition = null;

const tradeUiBuildPill = document.getElementById("trade-ui-build-pill");
const tradeStatusPill = document.getElementById("trade-status-pill");
const tradeHealthPill = document.getElementById("trade-health-pill");
const tradeMessage = document.getElementById("trade-form-message");
const tradeJsonPreview = document.getElementById("trade-json-preview");
const lifecycleTrack = document.getElementById("lifecycle-track");
const workflowCurrentStage = document.getElementById("workflow-current-stage");
const workflowTransitionCount = document.getElementById("workflow-transition-count");
const workflowTransitionNoteInput = document.getElementById("workflow-transition-note");
const workflowTransitionList = document.getElementById("workflow-transition-list");
const workflowTransitionHelp = document.getElementById("workflow-transition-help");
const checklist = document.getElementById("checklist");
const allocationList = document.getElementById("allocation-list");
const exceptionList = document.getElementById("exception-list");
const copilotList = document.getElementById("copilot-list");
const activityList = document.getElementById("activity-list");
const exposureSummary = document.getElementById("summary-exposure");
const checksSummary = document.getElementById("summary-checks");
const allocationsSummary = document.getElementById("summary-allocations");
const routeSummary = document.getElementById("summary-route");

const ticketIdInput = document.getElementById("ticket-id");
const ticketStatusInput = document.getElementById("ticket-status");
const tradeTypeInput = document.getElementById("trade-type");
const assetClassInput = document.getElementById("asset-class");
const productTypeInput = document.getElementById("product-type");
const instrumentInput = document.getElementById("instrument");
const quantityInput = document.getElementById("quantity");
const priceInput = document.getElementById("price");
const currencyInput = document.getElementById("currency");
const notionalInput = document.getElementById("notional");
const tradeDateInput = document.getElementById("trade-date");
const settleDateInput = document.getElementById("settle-date");
const bookInput = document.getElementById("book");
const strategyInput = document.getElementById("strategy");
const traderInput = document.getElementById("trader");
const counterpartyInput = document.getElementById("counterparty");
const venueInput = document.getElementById("venue");
const brokerInput = document.getElementById("broker");
const settlementInstructionInput = document.getElementById("settlement-instruction");
const tradeNotesInput = document.getElementById("trade-notes");
const settlementLocationInput = document.getElementById("settlement-location");
const cashAccountInput = document.getElementById("cash-account");
const settlementCommentsInput = document.getElementById("settlement-comments");
const saveButton = document.getElementById("trade-save-button");
const resetButton = document.getElementById("trade-reset-button");
const validateButton = document.getElementById("validate-button");
const approveButton = document.getElementById("approve-button");
const bookButton = document.getElementById("book-button");
const escalateButton = document.getElementById("escalate-button");
const rejectButton = document.getElementById("reject-button");
const duplicateButton = document.getElementById("duplicate-button");
const addAllocationButton = document.getElementById("add-allocation-button");
const sideButtons = Array.from(document.querySelectorAll("[data-side]"));
const tradeDetailInputs = [
    tradeTypeInput,
    assetClassInput,
    productTypeInput,
    instrumentInput,
    quantityInput,
    priceInput,
    currencyInput,
    tradeDateInput,
    settleDateInput,
    bookInput,
    strategyInput,
    traderInput,
    counterpartyInput,
    venueInput,
    brokerInput
];
const operationsInputs = [
    settlementInstructionInput,
    tradeNotesInput,
    settlementLocationInput,
    cashAccountInput,
    settlementCommentsInput
];

ticketStatusInput.disabled = true;
tradeUiBuildPill.textContent = "UI 2026-03-27.5";

bindText(ticketIdInput, value => tradeState.ticketId = value.trim() || tradeState.ticketId, "editTicketIdentity");
bindText(workflowTransitionNoteInput, value => tradeState.workflowTransitionNote = value, "editWorkflowNote");
bindText(tradeTypeInput, value => tradeState.tradeType = value, "editTradeDetails", "tradeType", "Trade type");
bindText(assetClassInput, value => tradeState.assetClass = value, "editTradeDetails", "assetClass", "Asset class");
bindText(productTypeInput, value => tradeState.productType = value.trim(), "editTradeDetails", "productType", "Product");
bindText(instrumentInput, value => tradeState.instrument = value.trim(), "editTradeDetails", "instrument", "Instrument");
bindText(quantityInput, value => tradeState.quantity = Number(value) || 0, "editTradeDetails", "quantity", "Quantity");
bindText(priceInput, value => tradeState.price = Number(value) || 0, "editTradeDetails", "price", "Price");
bindText(currencyInput, value => tradeState.currency = value.trim().toUpperCase(), "editTradeDetails", "currency", "Currency");
bindText(tradeDateInput, value => tradeState.tradeDate = value, "editTradeDetails", "tradeDate", "Trade date");
bindText(settleDateInput, value => tradeState.settleDate = value, "editTradeDetails", "settleDate", "Settle date");
bindText(bookInput, value => tradeState.book = value.trim(), "editTradeDetails", "book", "Book");
bindText(strategyInput, value => tradeState.strategy = value.trim(), "editTradeDetails", "strategy", "Strategy");
bindText(traderInput, value => tradeState.trader = value.trim(), "editTradeDetails", "trader", "Trader");
bindText(counterpartyInput, value => tradeState.counterparty = value.trim(), "editTradeDetails", "counterparty", "Counterparty");
bindText(venueInput, value => tradeState.venue = value.trim(), "editTradeDetails", "venue", "Venue");
bindText(brokerInput, value => tradeState.broker = value.trim(), "editTradeDetails", "broker", "Broker");
bindText(settlementInstructionInput, value => tradeState.settlementInstruction = value.trim(), "editOperationsFields", "settlementInstruction", "Settlement instruction");
bindText(tradeNotesInput, value => tradeState.notes = value, "editOperationsFields", "notes", "Trade notes");
bindText(settlementLocationInput, value => tradeState.settlementLocation = value.trim(), "editOperationsFields", "settlementLocation", "Settlement location");
bindText(cashAccountInput, value => tradeState.cashAccount = value.trim(), "editOperationsFields", "cashAccount", "Cash account");
bindText(settlementCommentsInput, value => tradeState.settlementComments = value, "editOperationsFields", "settlementComments", "Settlement comments");

sideButtons.forEach(button => {
    button.addEventListener("click", async () => {
        if (!guardTradeAction("editTradeDetails")) {
            return;
        }

        tradeState.side = button.dataset.side;
        renderTradeTicket();
        await persistTradeTicket(
            "TRADE_SIDE_UPDATED",
            `Trade side updated to ${tradeState.side}.`,
            {
                field: "side",
                value: tradeState.side
            });
    });
});

saveButton.addEventListener("click", async () => {
    if (!guardTradeAction("saveTrade")) {
        return;
    }

    const ready = await ensureWorkflowInstanceExists();
    if (!ready) {
        return;
    }

    pushActivity("Trade ticket saved to blotter.", "operator");
    await persistTradeTicket("TRADE_SAVED", "Trade ticket saved to blotter.");
    renderTradeTicket();
});

resetButton.addEventListener("click", () => {
    const reset = tradeStore.createNewTradeDraft();
    syncTradeState(reset);
    setTradeMessage("Trade ticket reset to a new draft.");
    updateLocation(null);
    renderTradeTicket();
});

validateButton.addEventListener("click", async () => await runNamedWorkflowCommand("VALIDATE"));
approveButton.addEventListener("click", async () => await runNamedWorkflowCommand("APPROVE"));
bookButton.addEventListener("click", async () => await runNamedWorkflowCommand("BOOK"));
escalateButton.addEventListener("click", async () => {
    if (!guardTradeAction("escalate")) {
        return;
    }

    await toggleEscalationState();
});
rejectButton.addEventListener("click", async () => await runNamedWorkflowCommand("REJECT"));
duplicateButton.addEventListener("click", async () => {
    if (!guardTradeAction("duplicate")) {
        return;
    }

    await duplicateTradeTicket();
});
addAllocationButton.addEventListener("click", async () => {
    if (!guardTradeAction("editAllocations")) {
        return;
    }

    await addAllocation();
});

workflowTransitionList.addEventListener("click", async event => {
    const button = event.target.closest("[data-workflow-command]");
    if (!button) {
        return;
    }

    const issues = getOpenIssues();
    const transition = getWorkflowTransitions(issues).find(item => item.command === button.dataset.workflowCommand);
    if (!transition) {
        return;
    }

    await runWorkflowTransition(transition);
});

checklist.addEventListener("change", async event => {
    if (!guardTradeAction("editChecks")) {
        renderTradeTicket();
        return;
    }

    const item = event.target.closest("[data-check-id]");
    if (!item) {
        return;
    }

    const check = tradeState.checks.find(entry => entry.id === item.dataset.checkId);
    if (!check) {
        return;
    }

    check.passed = event.target.checked;
    pushActivity(`${check.label} ${check.passed ? "marked complete" : "reopened"}.`, "control");
    renderTradeTicket();
    await persistTradeTicket(
        "TRADE_CHECK_UPDATED",
        `${check.label} ${check.passed ? "marked complete" : "reopened"}.`,
        {
            checkId: check.id,
            passed: String(check.passed)
        });
});

allocationList.addEventListener("input", event => {
    if (!guardTradeAction("editAllocations")) {
        renderTradeTicket();
        return;
    }

    const row = event.target.closest("[data-allocation-id]");
    if (!row) {
        return;
    }

    const allocation = tradeState.allocations.find(entry => entry.id === row.dataset.allocationId);
    if (!allocation) {
        return;
    }

    const field = event.target.dataset.field;
    if (!field) {
        return;
    }

    allocation[field] = field === "quantity" ? Number(event.target.value) || 0 : event.target.value.trim();
    renderTradeTicket();
});

allocationList.addEventListener("change", async event => {
    if (!guardTradeAction("editAllocations")) {
        renderTradeTicket();
        return;
    }

    const row = event.target.closest("[data-allocation-id]");
    if (!row) {
        return;
    }

    const field = event.target.dataset.field;
    if (!field) {
        return;
    }

    await persistTradeTicket(
        "TRADE_ALLOCATION_UPDATED",
        "Allocation slice updated.",
        {
            allocationId: row.dataset.allocationId,
            field,
            value: event.target.value
        });
});

allocationList.addEventListener("click", async event => {
    if (!guardTradeAction("editAllocations")) {
        renderTradeTicket();
        return;
    }

    const button = event.target.closest("[data-remove-allocation]");
    if (!button) {
        return;
    }

    tradeState.allocations = tradeState.allocations.filter(entry => entry.id !== button.dataset.removeAllocation);
    pushActivity("Allocation slice removed.", "allocation");
    renderTradeTicket();
    await persistTradeTicket(
        "TRADE_ALLOCATION_REMOVED",
        "Allocation slice removed.",
        {
            allocationId: button.dataset.removeAllocation
        });
});

function bindText(element, setter, actionKey = null, auditField = null, auditLabel = null) {
    element.addEventListener("input", () => {
        if (!guardTradeAction(actionKey)) {
            renderTradeTicket();
            return;
        }

        setter(element.value);
        renderTradeTicket();
    });

    element.addEventListener("change", async () => {
        if (!guardTradeAction(actionKey)) {
            renderTradeTicket();
            return;
        }

        setter(element.value);
        renderTradeTicket();

        if (auditField) {
            await persistTradeTicket(
                "TRADE_FIELD_UPDATED",
                `${auditLabel || auditField} updated.`,
                {
                    field: auditField,
                    value: element.value
                });
        }
    });
}

function renderTradeTicket() {
    ticketIdInput.value = tradeState.ticketId;
    ticketStatusInput.value = tradeState.status;
    tradeTypeInput.value = tradeState.tradeType;
    assetClassInput.value = tradeState.assetClass;
    productTypeInput.value = tradeState.productType;
    instrumentInput.value = tradeState.instrument;
    quantityInput.value = tradeState.quantity || "";
    priceInput.value = tradeState.price || "";
    currencyInput.value = tradeState.currency;
    tradeDateInput.value = tradeState.tradeDate;
    settleDateInput.value = tradeState.settleDate;
    bookInput.value = tradeState.book;
    strategyInput.value = tradeState.strategy;
    traderInput.value = tradeState.trader;
    counterpartyInput.value = tradeState.counterparty;
    venueInput.value = tradeState.venue;
    brokerInput.value = tradeState.broker;
    settlementInstructionInput.value = tradeState.settlementInstruction;
    tradeNotesInput.value = tradeState.notes;
    settlementLocationInput.value = tradeState.settlementLocation;
    cashAccountInput.value = tradeState.cashAccount;
    settlementCommentsInput.value = tradeState.settlementComments;
    workflowTransitionNoteInput.value = tradeState.workflowTransitionNote || "";

    document.querySelectorAll("[data-side]").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.side === tradeState.side);
    });

    const notional = tradeState.quantity * tradeState.price;
    const passedChecks = tradeState.checks.filter(item => item.passed).length;
    const route = getRouteLabel();
    const issues = getOpenIssues();
    const suggestions = getCopilotSuggestions(issues);
    const transitions = getWorkflowTransitions(issues);
    const transitionIndex = new Map(transitions.map(item => [item.command, item]));
    const actionPolicy = getTradeActionPolicy();

    notionalInput.value = formatCurrency(notional, tradeState.currency || "USD");
    tradeStatusPill.textContent = tradeState.status;
    tradeStatusPill.className = `pill trade-status-pill trade-status-${normalizeToken(tradeState.status)}`;
    tradeHealthPill.textContent = tradeState.exceptionState === "Escalated"
        ? "Escalated to exception queue"
        : issues.length === 0 ? "Ready to advance" : `${issues.length} open issue${issues.length === 1 ? "" : "s"}`;
    tradeHealthPill.className = `pill ${tradeState.exceptionState === "Escalated"
        ? "pill-error"
        : issues.length === 0 ? "pill-success" : "pill-warning"}`;

    exposureSummary.textContent = formatCurrency(notional, tradeState.currency || "USD");
    checksSummary.textContent = `${passedChecks} / ${tradeState.checks.length}`;
    allocationsSummary.textContent = String(tradeState.allocations.length);
    routeSummary.textContent = route;

    ticketIdInput.disabled = !actionPolicy.editTicketIdentity;
    tradeDetailInputs.forEach(input => input.disabled = !actionPolicy.editTradeDetails);
    operationsInputs.forEach(input => input.disabled = !actionPolicy.editOperationsFields);
    workflowTransitionNoteInput.disabled = !actionPolicy.editWorkflowNote;
    sideButtons.forEach(button => button.disabled = !actionPolicy.editTradeDetails);
    saveButton.disabled = !actionPolicy.saveTrade;
    addAllocationButton.disabled = !actionPolicy.editAllocations;
    duplicateButton.disabled = !actionPolicy.duplicate;
    validateButton.disabled = !transitionIndex.has("VALIDATE") || transitionIndex.get("VALIDATE").disabled;
    approveButton.disabled = !transitionIndex.has("APPROVE") || transitionIndex.get("APPROVE").disabled;
    bookButton.disabled = !transitionIndex.has("BOOK") || transitionIndex.get("BOOK").disabled;
    rejectButton.disabled = !transitionIndex.has("REJECT") || transitionIndex.get("REJECT").disabled;
    escalateButton.disabled = !actionPolicy.escalate;
    escalateButton.textContent = tradeState.exceptionState === "Escalated" ? "Clear Escalation" : "Escalate";

    renderWorkflowTransitions(transitions);
    renderLifecycle();
    renderChecklist();
    renderAllocations();
    renderExceptions(issues);
    renderCopilotSuggestions(suggestions);
    renderActivity();
    renderJsonPreview(notional, route, issues);

    tradeStore.saveDraft(tradeState);
}

function renderWorkflowTransitions(transitions) {
    workflowCurrentStage.textContent = tradeState.status;
    workflowTransitionCount.textContent = `${transitions.length} available transition${transitions.length === 1 ? "" : "s"}`;

    if (!tradeWorkflowDefinition) {
        workflowTransitionHelp.textContent = "Trade workflow definition is still loading.";
        workflowTransitionList.innerHTML = createEmptyState(
            "Workflow definition unavailable",
            "The trade workflow definition could not be loaded from the backend yet.");
        return;
    }

    if (tradeState.exceptionState === "Escalated") {
        workflowTransitionHelp.textContent = "This ticket is escalated operationally. Clear the escalation before advancing the workflow.";
        workflowTransitionList.innerHTML = createEmptyState(
            "Ticket is in the exception queue",
            "Operational escalation pauses forward workflow movement until it is cleared.");
        return;
    }

    workflowTransitionHelp.textContent = transitions.length === 0
        ? "No forward workflow command is currently available from this stage."
        : "These transitions are coming from the persisted trade-ticket workflow definition.";

    if (transitions.length === 0) {
        workflowTransitionList.innerHTML = createEmptyState(
            "No workflow transitions available",
            "This ticket is at a terminal or non-advanceable stage.");
        return;
    }

    workflowTransitionList.innerHTML = transitions
        .map(transition => `
            <article class="workflow-transition-card ${transition.variant === "warning" ? "is-warning" : ""}">
                <div class="section-title-row">
                    <div>
                        <p class="field-label">${escapeHtml(transition.command)}</p>
                        <h3>${escapeHtml(transition.label)}</h3>
                    </div>
                    <span class="pill">${escapeHtml(transition.nextStatus)}</span>
                </div>
                <p class="helper-copy">${escapeHtml(transition.description)}</p>
                <div class="toolbar">
                    <button
                        class="${transition.variant === "warning" ? "danger-button" : "ghost-button"}"
                        type="button"
                        data-workflow-command="${escapeHtml(transition.command)}"
                        ${transition.disabled ? "disabled" : ""}>
                        ${escapeHtml(transition.buttonLabel)}
                    </button>
                    <span class="helper-copy">${escapeHtml(transition.guardText)}</span>
                </div>
            </article>
        `)
        .join("");
}

function renderLifecycle() {
    const currentIndex = LIFECYCLE.indexOf(tradeState.status);

    lifecycleTrack.innerHTML = LIFECYCLE
        .map((status, index) => `
            <article class="lifecycle-step ${index < currentIndex ? "complete" : ""} ${index === currentIndex ? "active" : ""}">
                <span class="lifecycle-index">${index + 1}</span>
                <div>
                    <p class="field-label">Stage</p>
                    <h3>${escapeHtml(status)}</h3>
                </div>
            </article>
        `)
        .join("");
}

function renderChecklist() {
    const canEditChecks = isTradeActionAllowed("editChecks");

    checklist.innerHTML = tradeState.checks
        .map(item => `
            <label class="check-card">
                <input data-check-id="${escapeHtml(item.id)}" type="checkbox" ${item.passed ? "checked" : ""} ${canEditChecks ? "" : "disabled"}>
                <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <p class="helper-copy">${escapeHtml(item.description)}</p>
                </div>
            </label>
        `)
        .join("");
}

function renderAllocations() {
    const canEditAllocations = isTradeActionAllowed("editAllocations");

    if (tradeState.allocations.length === 0) {
        allocationList.innerHTML = createEmptyState(
            "No allocations yet",
            canEditAllocations
                ? "Add one or more allocation slices for downstream booking."
                : "Allocations are locked in the current workflow stage.");
        return;
    }

    allocationList.innerHTML = tradeState.allocations
        .map(allocation => `
            <article class="allocation-card" data-allocation-id="${escapeHtml(allocation.id)}">
                <div class="allocation-grid">
                    <label class="field">
                        <span class="field-label">Account</span>
                        <input data-field="account" class="text-input" type="text" value="${escapeHtml(allocation.account)}" placeholder="ACC-01" ${canEditAllocations ? "" : "disabled"}>
                    </label>
                    <label class="field">
                        <span class="field-label">Book</span>
                        <input data-field="book" class="text-input" type="text" value="${escapeHtml(allocation.book)}" placeholder="EQ-LONGONLY" ${canEditAllocations ? "" : "disabled"}>
                    </label>
                    <label class="field">
                        <span class="field-label">Quantity</span>
                        <input data-field="quantity" class="text-input" type="number" min="0" step="0.0001" value="${escapeHtml(allocation.quantity)}" placeholder="500" ${canEditAllocations ? "" : "disabled"}>
                    </label>
                </div>
                <div class="toolbar">
                    <span class="pill">${escapeHtml(allocation.account || "Draft slice")}</span>
                    <button data-remove-allocation="${escapeHtml(allocation.id)}" class="ghost-button" type="button" ${canEditAllocations ? "" : "disabled"}>Remove</button>
                </div>
            </article>
        `)
        .join("");
}

function getTradeActionPolicy() {
    const base = TRADE_ACTION_POLICY_BY_STATUS[tradeState.status] || {};
    return {
        editTradeDetails: Boolean(base.editTradeDetails),
        editOperationsFields: Boolean(base.editOperationsFields),
        editWorkflowNote: Boolean(base.editWorkflowNote),
        editChecks: Boolean(base.editChecks),
        editAllocations: Boolean(base.editAllocations),
        saveTrade: Boolean(base.saveTrade),
        escalate: Boolean(base.escalate),
        duplicate: Boolean(base.duplicate),
        editTicketIdentity: Boolean(base.editTradeDetails) && !tradeState.workflowInstanceId
    };
}

function isTradeActionAllowed(actionKey) {
    if (!actionKey) {
        return true;
    }

    return Boolean(getTradeActionPolicy()[actionKey]);
}

function guardTradeAction(actionKey) {
    if (isTradeActionAllowed(actionKey)) {
        return true;
    }

    setTradeMessage(getBlockedActionMessage(actionKey), true);
    return false;
}

function getBlockedActionMessage(actionKey) {
    switch (actionKey) {
        case "editTicketIdentity":
            return "Ticket ID is locked once the trade has a workflow identity. Duplicate the ticket to create a new identifier.";
        case "editTradeDetails":
            return `Trade economics are locked while the ticket is ${tradeState.status}. Use a workflow transition to move it back to an editable stage first.`;
        case "editOperationsFields":
            return `Operational fields are locked while the ticket is ${tradeState.status}. Advance or reopen the workflow before editing them.`;
        case "editChecks":
            return `Control completion is not editable while the ticket is ${tradeState.status}.`;
        case "editAllocations":
            return `Allocations are locked while the ticket is ${tradeState.status}.`;
        case "saveTrade":
            return `This ticket is read-only while it is ${tradeState.status}. Only permitted workflow actions are available.`;
        case "escalate":
            return `Operational escalation is not allowed while the ticket is ${tradeState.status}.`;
        case "duplicate":
            return `Ticket duplication is not allowed while the ticket is ${tradeState.status}.`;
        case "editWorkflowNote":
            return `Workflow notes are only available when the current stage allows a workflow action.`;
        default:
            return `This action is not allowed while the ticket is ${tradeState.status}.`;
    }
}

function renderExceptions(issues) {
    const exceptionCards = [];

    if (tradeState.exceptionState === "Escalated") {
        exceptionCards.push({
            severity: "High",
            area: "Operations",
            title: "Ticket is escalated",
            copy: "This trade is currently routed to the exception queue for operational handling."
        });
    }

    exceptionCards.push(...issues);

    if (exceptionCards.length === 0) {
        exceptionList.innerHTML = createEmptyState("No open exceptions", "The ticket is complete enough to move through the normal lane.");
        return;
    }

    exceptionList.innerHTML = exceptionCards
        .map(issue => `
            <article class="exception-card severity-${normalizeToken(issue.severity)}">
                <div class="toolbar">
                    <span class="pill">${escapeHtml(issue.severity)}</span>
                    <span class="pill">${escapeHtml(issue.area)}</span>
                </div>
                <h3>${escapeHtml(issue.title)}</h3>
                <p class="helper-copy">${escapeHtml(issue.copy)}</p>
            </article>
        `)
        .join("");
}

function renderCopilotSuggestions(suggestions) {
    copilotList.innerHTML = suggestions
        .map(item => `
            <article class="copilot-card">
                <div class="toolbar">
                    <span class="pill">${escapeHtml(item.label)}</span>
                </div>
                <p>${escapeHtml(item.copy)}</p>
            </article>
        `)
        .join("");
}

function renderActivity() {
    activityList.innerHTML = tradeState.activity
        .slice()
        .reverse()
        .map(item => `
            <article class="activity-card">
                <div class="toolbar">
                    <span class="pill">${escapeHtml(item.actor)}</span>
                    <span class="pill">${escapeHtml(item.timestamp)}</span>
                </div>
                <p>${escapeHtml(item.message)}</p>
            </article>
        `)
        .join("");
}

function renderJsonPreview(notional, route, issues) {
    const payload = {
        ticketId: tradeState.ticketId,
        workflow: {
            workflowId: tradeState.workflowId,
            workflowInstanceId: tradeState.workflowInstanceId,
            workflowVersion: tradeState.workflowVersion,
            workflowInstanceVersion: tradeState.workflowInstanceVersion,
            currentStatus: tradeState.status,
            exceptionState: tradeState.exceptionState
        },
        route,
        economics: {
            tradeType: tradeState.tradeType,
            assetClass: tradeState.assetClass,
            productType: tradeState.productType,
            instrument: tradeState.instrument,
            side: tradeState.side,
            quantity: tradeState.quantity,
            price: tradeState.price,
            currency: tradeState.currency,
            notional
        },
        booking: {
            tradeDate: tradeState.tradeDate,
            settleDate: tradeState.settleDate,
            book: tradeState.book,
            strategy: tradeState.strategy,
            trader: tradeState.trader,
            counterparty: tradeState.counterparty,
            venue: tradeState.venue,
            broker: tradeState.broker
        },
        controls: {
            checks: tradeState.checks,
            openIssues: issues
        },
        settlement: {
            instruction: tradeState.settlementInstruction,
            location: tradeState.settlementLocation,
            cashAccount: tradeState.cashAccount,
            comments: tradeState.settlementComments
        },
        allocations: tradeState.allocations,
        notes: tradeState.notes,
        timestamps: {
            createdAt: tradeState.createdAt,
            updatedAt: tradeState.updatedAt
        }
    };

    tradeJsonPreview.textContent = JSON.stringify(payload, null, 2);
}

async function runWorkflowTransition(transition) {
    if (transition.disabled) {
        setTradeMessage(transition.guardText, true);
        return;
    }

    const ready = await ensureWorkflowInstanceExists();
    if (!ready) {
        return;
    }

    const note = String(tradeState.workflowTransitionNote || "").trim();
    const response = await executeWorkflowCommand(transition.command);
    if (!response) {
        return;
    }

    const activityMessage = note
        ? `${transition.activityMessage} Note: ${note}`
        : transition.activityMessage;

    pushActivity(activityMessage, transition.variant === "warning" ? "exception" : "workflow");
    tradeState.workflowTransitionNote = "";
    await persistTradeTicket(
        `WORKFLOW_${transition.command}`,
        activityMessage,
        {
            workflowCommand: transition.command,
            nextStatus: tradeState.status
        });
    setTradeMessage(`${transition.label} completed.`);
    renderTradeTicket();
}

async function runNamedWorkflowCommand(commandName) {
    const transition = getWorkflowTransitions(getOpenIssues()).find(item => item.command === commandName);
    if (!transition) {
        setTradeMessage("No matching workflow transition is currently available for this ticket.", true);
        return;
    }

    await runWorkflowTransition(transition);
}

async function ensureWorkflowInstanceExists() {
    if (!tradeWorkflowDefinition) {
        setTradeMessage("Trade workflow definition is not available yet.", true);
        return false;
    }

    const knownInstanceId = tradeState.workflowInstanceId || tradeState.ticketId;
    if (knownInstanceId) {
        const existing = await tryGetWorkflowInstance(knownInstanceId);
        if (existing) {
            applyWorkflowInstance(existing);
            tradeStore.saveDraft(tradeState);
            return true;
        }
    }

    const desiredStatus = tradeState.status;
    const created = await createWorkflowInstance();
    if (!created) {
        return false;
    }

    applyWorkflowInstance(created);

    for (const command of getReplayCommandsForStatus(desiredStatus)) {
        const replayed = await executeWorkflowCommand(command, true);
        if (!replayed) {
            return false;
        }
    }

    tradeStore.saveDraft(tradeState);
    return true;
}

async function createWorkflowInstance() {
    try {
        const payload = await fetchJson("/workflow-instances", {
            method: "POST",
            body: JSON.stringify({
                workflowId: TRADE_WORKFLOW_ID,
                instanceId: tradeState.ticketId,
                context: buildWorkflowContext(),
                triggerSource: "trade-ticket-ui-create",
                actorId: tradeState.trader || "trade-operator",
                correlationId: tradeState.ticketId
            })
        });

        return payload.instance;
    }
    catch (error) {
        setTradeMessage(String(error), true);
        return null;
    }
}

async function executeWorkflowCommand(commandCode, isReplay = false) {
    try {
        const payload = await fetchJson(`/workflow-instances/${encodeURIComponent(tradeState.workflowInstanceId || tradeState.ticketId)}/commands`, {
            method: "POST",
            body: JSON.stringify({
                commandCode,
                expectedVersion: tradeState.workflowInstanceVersion,
                context: buildWorkflowContext(),
                triggerSource: isReplay ? "trade-ticket-ui-replay" : "trade-ticket-ui-command",
                actorId: tradeState.trader || "trade-operator",
                correlationId: tradeState.ticketId
            })
        });

        applyWorkflowInstance(payload.instance);
        return payload.instance;
    }
    catch (error) {
        setTradeMessage(String(error), true);
        return null;
    }
}

async function tryGetWorkflowInstance(instanceId) {
    try {
        return await fetchJson(`/workflow-instances/${encodeURIComponent(instanceId)}`);
    }
    catch {
        return null;
    }
}

function applyWorkflowInstance(instance) {
    tradeState.workflowId = instance.workflowId;
    tradeState.workflowInstanceId = instance.id;
    tradeState.workflowVersion = instance.workflowVersion;
    tradeState.workflowInstanceVersion = instance.version;
    tradeState.status = instance.currentStatus;
}

function buildWorkflowContext() {
    return {
        ticketId: tradeState.ticketId,
        tradeType: tradeState.tradeType,
        assetClass: tradeState.assetClass,
        productType: tradeState.productType,
        instrument: tradeState.instrument,
        side: tradeState.side,
        quantity: String(tradeState.quantity),
        price: String(tradeState.price),
        currency: tradeState.currency,
        tradeDate: tradeState.tradeDate,
        settleDate: tradeState.settleDate,
        book: tradeState.book,
        strategy: tradeState.strategy,
        trader: tradeState.trader,
        counterparty: tradeState.counterparty,
        venue: tradeState.venue,
        broker: tradeState.broker,
        settlementInstruction: tradeState.settlementInstruction,
        settlementLocation: tradeState.settlementLocation,
        cashAccount: tradeState.cashAccount,
        exceptionState: tradeState.exceptionState || "",
        checksPassed: String(tradeState.checks.every(item => item.passed)),
        issueCount: String(getOpenIssues().length)
    };
}

async function duplicateTradeTicket() {
    const duplicated = tradeStore.createNewTradeDraft();
    Object.assign(duplicated, {
        ...tradeState,
        ticketId: tradeStore.createDefaultTradeDraft().ticketId,
        version: 0,
        status: "Captured",
        workflowId: TRADE_WORKFLOW_ID,
        workflowInstanceId: null,
        workflowVersion: 0,
        workflowInstanceVersion: 0,
        exceptionState: null,
        activity: [...tradeState.activity]
    });

    duplicated.activity.push({
        message: "Draft duplicated into a fresh captured ticket.",
        actor: "operator",
        timestamp: timestampNow()
    });

    syncTradeState(duplicated);
    tradeStore.saveDraft(tradeState);
    updateLocation(null);
    await persistTradeTicket("TRADE_DUPLICATED", "Draft duplicated into a fresh captured ticket.");
    setTradeMessage("Trade ticket duplicated.");
    renderTradeTicket();
}

async function addAllocation() {
    const allocationId = crypto.randomUUID();
    tradeState.allocations.push({
        id: allocationId,
        account: "",
        book: tradeState.book || "",
        quantity: 0
    });

    pushActivity("Allocation slice added.", "allocation");
    renderTradeTicket();
    await persistTradeTicket(
        "TRADE_ALLOCATION_ADDED",
        "Allocation slice added.",
        {
            allocationId
        });
}

function pushActivity(message, actor) {
    tradeState.activity.push({
        message,
        actor,
        timestamp: timestampNow()
    });

    tradeState.activity = tradeState.activity.slice(-20);
}

function getWorkflowTransitions(issues) {
    if (!tradeWorkflowDefinition) {
        return [];
    }

    if (tradeState.exceptionState === "Escalated") {
        return [];
    }

    const activeStatus = (tradeWorkflowDefinition.statuses || []).find(status => status.code === tradeState.status);
    if (!activeStatus) {
        return [];
    }

    return (activeStatus.actions || [])
        .filter(action => action.mode === "Manual")
        .map(action => {
            const metadata = WORKFLOW_COMMAND_METADATA[action.code] || {};
            const guard = evaluateTransitionGuard(action.code, issues);
            return {
                command: action.code,
                label: action.name,
                buttonLabel: metadata.buttonLabel || action.name,
                nextStatus: action.targetStatus,
                description: action.description || `Advance the ticket to ${action.targetStatus}.`,
                activityMessage: action.description || `${action.name} executed.`,
                guardText: guard.guardText,
                disabled: guard.disabled,
                variant: metadata.variant || "normal"
            };
        });
}

function evaluateTransitionGuard(commandCode, issues) {
    const hasCriticalIssues = issues.some(issue => issue.severity === "Critical");
    const allChecksPassed = tradeState.checks.every(item => item.passed);

    switch (commandCode) {
        case "VALIDATE":
            return {
                disabled: hasCriticalIssues,
                guardText: hasCriticalIssues
                    ? "Resolve critical issues first."
                    : "Ready when economics and mandatory fields are complete."
            };
        case "SEND_FOR_APPROVAL":
            return {
                disabled: hasCriticalIssues,
                guardText: hasCriticalIssues
                    ? "Approval routing is blocked by critical issues."
                    : "Desk validation is complete and the ticket can be sent onward."
            };
        case "APPROVE":
            return {
                disabled: hasCriticalIssues,
                guardText: hasCriticalIssues
                    ? "Approval is blocked by critical issues."
                    : "Ready when approval conditions are satisfied."
            };
        case "BOOK":
            return {
                disabled: !allChecksPassed,
                guardText: allChecksPassed
                    ? "All controls are satisfied."
                    : "All controls and allocations must be complete before booking."
            };
        default:
            return {
                disabled: false,
                guardText: "Transition is available from the persisted workflow definition."
            };
    }
}

function getReplayCommandsForStatus(status) {
    return WORKFLOW_REPLAY_BY_STATUS[status] || [];
}

function getRouteLabel() {
    if (tradeState.exceptionState === "Escalated") {
        return "Exception Queue";
    }

    if (tradeState.status === "Rejected") {
        return "Rejected / Hold";
    }

    if (tradeState.status === "Booked") {
        return "Booked / Downstream Ops";
    }

    return tradeState.checks.every(item => item.passed)
        ? "Ready For Booking"
        : "Desk Intake";
}

function getOpenIssues() {
    const issues = [];

    if (!tradeState.tradeType) {
        issues.push({
            severity: "Critical",
            area: "Economics",
            title: "Trade type missing",
            copy: "Classify the ticket as cash, position-based, or contract / OTC before progressing."
        });
    }

    if (!tradeState.instrument) {
        issues.push({
            severity: "Critical",
            area: "Economics",
            title: "Instrument missing",
            copy: "The trade ticket cannot proceed without an instrument or product identifier."
        });
    }

    if (!tradeState.counterparty) {
        issues.push({
            severity: "High",
            area: "Counterparty",
            title: "Counterparty missing",
            copy: "Capture the facing counterparty before routing approvals."
        });
    }

    if (!tradeState.book) {
        issues.push({
            severity: "High",
            area: "Booking",
            title: "Book assignment incomplete",
            copy: "A target book is required before the ticket can be booked."
        });
    }

    if (tradeState.quantity <= 0 || tradeState.price <= 0) {
        issues.push({
            severity: "Critical",
            area: "Economics",
            title: "Quantity or price invalid",
            copy: "Both quantity and price must be positive for the notional to be meaningful."
        });
    }

    if (!tradeState.settlementInstruction || !tradeState.settlementLocation) {
        issues.push({
            severity: "Medium",
            area: "Settlement",
            title: "Settlement setup incomplete",
            copy: "Standing settlement details are still missing."
        });
    }

    const allocationTotal = tradeState.allocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    if (tradeState.allocations.length > 0 && allocationTotal !== tradeState.quantity) {
        issues.push({
            severity: "Medium",
            area: "Allocations",
            title: "Allocation quantity mismatch",
            copy: "Allocation slices do not currently sum to the ticket quantity."
        });
    }

    return issues;
}

function getCopilotSuggestions(issues) {
    const suggestions = [
        {
            label: "Desk agent",
            copy: `Suggested workflow route: ${getRouteLabel()}.`
        }
    ];

    if (tradeState.exceptionState === "Escalated") {
        suggestions.push({
            label: "Ops agent",
            copy: "The ticket is escalated operationally. Clear the exception queue item before advancing workflow."
        });
    }

    if (issues.some(issue => issue.area === "Settlement")) {
        suggestions.push({
            label: "Ops agent",
            copy: "Pre-stage settlement instructions and cash account before sending this ticket to operations."
        });
    }

    if (issues.some(issue => issue.area === "Allocations")) {
        suggestions.push({
            label: "Allocation agent",
            copy: "Normalize allocation quantities so the total matches the parent trade before booking."
        });
    }

    if (tradeState.status === "Approved") {
        suggestions.push({
            label: "Booking agent",
            copy: "Ticket is approved. Next controlled action is to book and produce downstream settlement obligations."
        });
    }

    return suggestions;
}

async function toggleEscalationState() {
    if (tradeState.status === "Rejected") {
        setTradeMessage("Rejected tickets cannot be escalated.", true);
        return;
    }

    tradeState.exceptionState = tradeState.exceptionState === "Escalated" ? null : "Escalated";
    const message = tradeState.exceptionState === "Escalated"
        ? "Ticket escalated to the exception queue without changing workflow stage."
        : "Operational escalation cleared. The ticket remains in its current workflow stage.";

    pushActivity(message, "exception");
    await persistTradeTicket(
        "TRADE_EXCEPTION_UPDATED",
        message,
        {
            exceptionState: tradeState.exceptionState || ""
        });
    setTradeMessage(message, tradeState.exceptionState === "Escalated");
    renderTradeTicket();
}

function updateLocation(ticketId) {
    const target = ticketId
        ? `${window.location.pathname}?ticketId=${encodeURIComponent(ticketId)}`
        : window.location.pathname;
    window.history.replaceState({}, "", target);
}

function syncTradeState(nextTrade) {
    for (const key of Object.keys(tradeState)) {
        delete tradeState[key];
    }

    Object.assign(tradeState, nextTrade);
}

function timestampNow() {
    return new Date().toISOString().replace("T", " ").slice(0, 16);
}

async function loadTradeWorkflowDefinition() {
    try {
        tradeWorkflowDefinition = await fetchJson(`/workflows/${encodeURIComponent(TRADE_WORKFLOW_ID)}`);
        setTradeMessage("");
    }
    catch (error) {
        tradeWorkflowDefinition = null;
        setTradeMessage(`Trade workflow definition could not be loaded: ${error}`, true);
    }
}

async function syncWorkflowInstanceIfPresent() {
    const instanceId = tradeState.workflowInstanceId || requestedTicketId || tradeState.ticketId;
    if (!instanceId) {
        return;
    }

    const instance = await tryGetWorkflowInstance(instanceId);
    if (!instance) {
        return;
    }

    applyWorkflowInstance(instance);
    const saved = tradeStore.cacheTrade(tradeState);
    syncTradeState(saved);
}

async function loadTradeFromServerIfPresent() {
    const ticketId = requestedTicketId || tradeState.ticketId;
    if (!ticketId) {
        return;
    }

    const serverTrade = await tradeStore.getTradeAsync(ticketId);
    if (!serverTrade) {
        return;
    }

    syncTradeState(serverTrade);
}

async function persistTradeTicket(actionCode, description, metadata = null) {
    try {
        const payload = await tradeStore.saveTradeToServerAsync(tradeState, {
            actionCode,
            description,
            triggerSource: "trade-ticket-ui",
            actorId: tradeState.trader || "trade-operator",
            correlationId: tradeState.ticketId,
            metadata
        });

        syncTradeState(payload.trade);
        updateLocation(payload.trade.ticketId);
        return true;
    }
    catch (error) {
        setTradeMessage(String(error), true);
        return false;
    }
}

async function fetchJson(path, options = {}) {
    const request = {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(path, request);
    const text = await response.text();
    let payload = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        }
        catch {
            payload = text;
        }
    }

    if (!response.ok) {
        throw new Error(payload?.error || payload || `${response.status} ${response.statusText}`);
    }

    return payload;
}

function formatCurrency(value, currency) {
    const code = String(currency || "USD").trim().toUpperCase();
    const amount = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);

    return `${code} ${amount}`;
}

function normalizeToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
}

function setTradeMessage(message, isError = false) {
    tradeMessage.textContent = message;
    tradeMessage.className = `message-banner${message ? isError ? " error" : " success" : ""}`;
}

function createEmptyState(title, copy) {
    const template = document.getElementById("trade-empty-state-template");
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".empty-title").textContent = title;
    fragment.querySelector(".empty-copy").textContent = copy;
    const wrapper = document.createElement("div");
    wrapper.append(fragment);
    return wrapper.innerHTML;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

async function initTradeTicket() {
    await loadTradeWorkflowDefinition();
    await loadTradeFromServerIfPresent();
    await syncWorkflowInstanceIfPresent();
    renderTradeTicket();
}

void initTradeTicket();
