const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;
const LAYOUT_STORAGE_KEY = "squiddy.workflow.layout.v1";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;

const state = {
    workflows: [],
    selectedWorkflowId: null,
    filter: "",
    draft: emptyWorkflow(),
    layout: {},
    selectedStatusCode: "Draft",
    selectedActionRef: null,
    connectMode: false,
    connectionSource: null,
    drag: null,
    zoom: 1
};

const workflowList = document.getElementById("workflow-list");
const workflowSearch = document.getElementById("workflow-search");
const workflowForm = document.getElementById("workflow-form");
const workflowIdInput = document.getElementById("workflow-id");
const workflowNameInput = document.getElementById("workflow-name");
const workflowDescriptionInput = document.getElementById("workflow-description");
const workflowInitialStatusInput = document.getElementById("workflow-initial-status");
const previewSummary = document.getElementById("preview-summary");
const workflowJsonPreview = document.getElementById("workflow-json-preview");
const refreshButton = document.getElementById("refresh-button");
const newWorkflowButton = document.getElementById("new-workflow-button");
const resetButton = document.getElementById("reset-button");
const deleteButton = document.getElementById("delete-button");
const addStatusButton = document.getElementById("add-status-button");
const connectButton = document.getElementById("connect-button");
const autoLayoutButton = document.getElementById("autolayout-button");
const zoomOutButton = document.getElementById("zoom-out-button");
const zoomResetButton = document.getElementById("zoom-reset-button");
const zoomInButton = document.getElementById("zoom-in-button");
const editorTitle = document.getElementById("editor-title");
const formMessage = document.getElementById("form-message");
const inspectorContent = document.getElementById("inspector-content");
const canvasModeLabel = document.getElementById("canvas-mode-label");
const canvas = document.getElementById("workflow-canvas");
const canvasContent = document.getElementById("workflow-canvas-content");
const canvasSvg = document.getElementById("workflow-canvas-svg");
const canvasNodes = document.getElementById("workflow-canvas-nodes");

canvasSvg.setAttribute("viewBox", `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
canvasContent.style.width = `${CANVAS_WIDTH}px`;
canvasContent.style.height = `${CANVAS_HEIGHT}px`;

workflowSearch.addEventListener("input", () => {
    state.filter = workflowSearch.value.trim().toLowerCase();
    renderWorkflowList();
});

workflowForm.addEventListener("submit", async event => {
    event.preventDefault();
    await saveWorkflow();
});

workflowIdInput.addEventListener("input", () => {
    state.draft.id = workflowIdInput.value.trim();
    renderWorkflowHeader();
    renderJsonPreview();
});

workflowNameInput.addEventListener("input", () => {
    state.draft.name = workflowNameInput.value.trim();
    renderWorkflowHeader();
    renderWorkflowList();
    renderCanvas();
    renderJsonPreview();
});

workflowDescriptionInput.addEventListener("input", () => {
    state.draft.description = workflowDescriptionInput.value;
    renderJsonPreview();
});

workflowInitialStatusInput.addEventListener("change", () => {
    state.draft.initialStatus = workflowInitialStatusInput.value;
    renderCanvas();
    renderInspector();
    renderJsonPreview();
});

refreshButton.addEventListener("click", loadWorkflows);
newWorkflowButton.addEventListener("click", () => selectWorkflow(null));
resetButton.addEventListener("click", () => {
    const selected = getSelectedWorkflow();
    if (selected) {
        selectWorkflow(selected);
    } else {
        selectWorkflow(null);
    }

    setMessage("");
});
deleteButton.addEventListener("click", deleteCurrentWorkflow);
addStatusButton.addEventListener("click", () => {
    const status = createStatus();
    state.draft.statuses.push(status);
    state.layout[status.code] = centeredPosition();
    state.selectedStatusCode = status.code;
    state.selectedActionRef = null;
    ensureInitialStatus();
    persistLayout();
    renderDraft();
});
connectButton.addEventListener("click", () => {
    state.connectMode = !state.connectMode;
    state.connectionSource = null;
    renderConnectMode();
    renderCanvas();
});
autoLayoutButton.addEventListener("click", () => {
    autoLayout();
    persistLayout();
    renderCanvas();
});
zoomOutButton.addEventListener("click", () => setZoom(state.zoom - ZOOM_STEP));
zoomResetButton.addEventListener("click", () => setZoom(1));
zoomInButton.addEventListener("click", () => setZoom(state.zoom + ZOOM_STEP));

canvasNodes.addEventListener("click", event => {
    const actionBadge = event.target.closest("[data-select-action]");
    if (actionBadge) {
        const statusCode = actionBadge.dataset.statusCode;
        const actionCode = actionBadge.dataset.actionCode;
        selectAction(statusCode, actionCode);
        return;
    }

    const node = event.target.closest("[data-status-code]");
    if (!node) {
        return;
    }

    const statusCode = node.dataset.statusCode;

    if (state.connectMode) {
        handleConnectSelection(statusCode);
        return;
    }

    state.selectedStatusCode = statusCode;
    state.selectedActionRef = null;
    renderCanvas();
    renderInspector();
});

canvasNodes.addEventListener("pointerdown", event => {
    const node = event.target.closest("[data-status-code]");
    if (!node || event.target.closest("button")) {
        return;
    }

    const statusCode = node.dataset.statusCode;
    const position = state.layout[statusCode];
    if (!position) {
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    node.setPointerCapture(event.pointerId);
    state.drag = {
        pointerId: event.pointerId,
        statusCode,
        offsetX: (event.clientX - canvasRect.left + canvas.scrollLeft) / state.zoom - position.x,
        offsetY: (event.clientY - canvasRect.top + canvas.scrollTop) / state.zoom - position.y
    };
});

canvasNodes.addEventListener("pointermove", event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const nextX = clamp((event.clientX - canvasRect.left + canvas.scrollLeft) / state.zoom - state.drag.offsetX, 24, CANVAS_WIDTH - NODE_WIDTH - 24);
    const nextY = clamp((event.clientY - canvasRect.top + canvas.scrollTop) / state.zoom - state.drag.offsetY, 24, CANVAS_HEIGHT - NODE_HEIGHT - 24);
    state.layout[state.drag.statusCode] = { x: nextX, y: nextY };
    renderCanvas();
});

canvasNodes.addEventListener("pointerup", event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
    }

    persistLayout();
    state.drag = null;
});

canvasNodes.addEventListener("pointercancel", () => {
    state.drag = null;
});

canvasSvg.addEventListener("click", event => {
    const path = event.target.closest("path[data-status-code]");
    if (!path) {
        return;
    }

    selectAction(path.dataset.statusCode, path.dataset.actionCode);
});

inspectorContent.addEventListener("click", event => {
    const target = event.target;
    const action = target.closest("[data-action]");
    if (!action) {
        return;
    }

    const actionName = action.dataset.action;
    const statusCode = action.dataset.statusCode;
    const actionCode = action.dataset.actionCode ?? null;
    const conditionIndex = action.dataset.conditionIndex ? Number(action.dataset.conditionIndex) : null;

    switch (actionName) {
        case "set-status":
            state.selectedStatusCode = statusCode;
            state.selectedActionRef = null;
            renderDraft();
            return;
        case "remove-status":
            removeStatus(statusCode);
            return;
        case "add-action":
            addAction(statusCode);
            return;
        case "remove-action":
            removeAction(statusCode, actionCode);
            return;
        case "select-action":
            selectAction(statusCode, actionCode);
            return;
        case "add-condition":
            addCondition(statusCode, actionCode);
            return;
        case "remove-condition":
            removeCondition(statusCode, actionCode, conditionIndex);
            return;
        default:
            return;
    }
});

inspectorContent.addEventListener("input", event => {
    const target = event.target;
    const field = target.dataset.field;
    if (!field) {
        return;
    }

    if (shouldDeferInspectorField(field, target)) {
        return;
    }

    const statusCode = target.dataset.statusCode;
    const actionCode = target.dataset.actionCode ?? null;
    const conditionIndex = target.dataset.conditionIndex ? Number(target.dataset.conditionIndex) : null;
    handleInspectorFieldInput(field, statusCode, actionCode, conditionIndex, target);
});

inspectorContent.addEventListener("change", event => {
    const target = event.target;
    const field = target.dataset.field;
    if (!field) {
        return;
    }

    const statusCode = target.dataset.statusCode;
    const actionCode = target.dataset.actionCode ?? null;
    const conditionIndex = target.dataset.conditionIndex ? Number(target.dataset.conditionIndex) : null;
    handleInspectorFieldInput(field, statusCode, actionCode, conditionIndex, target);
});

void loadWorkflows();

async function loadWorkflows() {
    setBusy(true);
    setMessage("");

    try {
        state.workflows = await fetchJson("/workflows");
        if (state.selectedWorkflowId && !state.workflows.some(workflow => workflow.id === state.selectedWorkflowId)) {
            state.selectedWorkflowId = null;
        }

        renderWorkflowList();
        const selected = getSelectedWorkflow();
        selectWorkflow(selected);
    } catch (error) {
        setMessage(`Failed to load workflows. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function saveWorkflow() {
    let workflow;

    try {
        syncDraftFromVisibleEditors();
        workflow = serializeDraft();
        validateWorkflow(workflow);
    } catch (error) {
        setMessage(error.message, true);
        return;
    }

    setBusy(true);
    setMessage("Saving workflow...");

    try {
        const selectedWorkflow = getSelectedWorkflow();
        const expectedVersion = selectedWorkflow?.id === workflow.id
            ? selectedWorkflow.version ?? null
            : null;
        await fetchJson("/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow, expectedVersion })
        });

        const persistedWorkflow = await fetchJson(`/workflows/${encodeURIComponent(workflow.id)}`);
        const persistenceMismatches = findPersistenceMismatches(workflow, persistedWorkflow);
        if (persistenceMismatches.length) {
            throw new Error(`Persisted workflow differs from editor state: ${persistenceMismatches.join(", ")}`);
        }

        persistLayout(workflow.id);
        state.selectedWorkflowId = workflow.id;
        await loadWorkflows();
        setMessage(`Workflow '${workflow.id}' saved.`);
    } catch (error) {
        setMessage(`Save failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function deleteCurrentWorkflow() {
    const workflow = getSelectedWorkflow();
    if (!workflow) {
        return;
    }

    if (!window.confirm(`Delete workflow '${workflow.id}' and any local activity tied to it?`)) {
        return;
    }

    setBusy(true);
    setMessage("Deleting workflow...");

    try {
        const response = await fetch(`/workflows/${encodeURIComponent(workflow.id)}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error(`/workflows/${workflow.id} returned ${response.status}`);
        }

        deleteLayout(workflow.id);
        state.selectedWorkflowId = null;
        selectWorkflow(null);
        await loadWorkflows();
        setMessage(`Workflow '${workflow.id}' deleted.`);
    } catch (error) {
        setMessage(`Delete failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

function selectWorkflow(workflow) {
    const normalized = normalizeWorkflow(workflow ?? emptyWorkflow());
    state.selectedWorkflowId = workflow?.id ?? null;
    state.draft = normalized;
    state.layout = normalizeLayout(loadLayout(workflow?.id), normalized.statuses);
    state.selectedStatusCode = normalized.statuses[0]?.code ?? null;
    state.selectedActionRef = null;
    state.connectMode = false;
    state.connectionSource = null;
    populateForm();
    renderWorkflowList();
    renderDraft();
}

function populateForm() {
    workflowIdInput.value = state.draft.id ?? "";
    workflowNameInput.value = state.draft.name ?? "";
    workflowDescriptionInput.value = state.draft.description ?? "";
    deleteButton.disabled = !getSelectedWorkflow();
    renderInitialStatusOptions();
    renderWorkflowHeader();
}

function renderDraft() {
    renderWorkflowHeader();
    renderInitialStatusOptions();
    renderSummary();
    renderCanvas();
    renderInspector();
    renderJsonPreview();
}

function renderDerivedState(options = {}) {
    renderWorkflowHeader();
    renderInitialStatusOptions();
    renderSummary();
    renderCanvas();
    renderJsonPreview();

    if (options.includeWorkflowList) {
        renderWorkflowList();
    }
}

function renderWorkflowHeader() {
    const isSaved = !!getSelectedWorkflow();
    const workflowName = state.draft.name || "Untitled workflow";
    editorTitle.textContent = isSaved ? `Edit ${workflowName}` : "Create workflow";
}

function renderInitialStatusOptions() {
    const statuses = state.draft.statuses ?? [];
    workflowInitialStatusInput.innerHTML = statuses.map(status => `
        <option value="${escapeHtml(status.code)}" ${status.code === state.draft.initialStatus ? "selected" : ""}>
            ${escapeHtml(status.name || status.code)}
        </option>
    `).join("");

    if (!statuses.some(status => status.code === state.draft.initialStatus)) {
        state.draft.initialStatus = statuses[0]?.code ?? "";
        workflowInitialStatusInput.value = state.draft.initialStatus;
    }
}

function renderSummary() {
    const statuses = state.draft.statuses ?? [];
    const actionCount = statuses.reduce((count, status) => count + status.actions.length, 0);
    const autoCount = statuses.reduce((count, status) => count + status.actions.filter(action => action.mode === "Automatic").length, 0);

    previewSummary.innerHTML = [
        { label: "Statuses", value: statuses.length },
        { label: "Actions", value: actionCount },
        { label: "Auto", value: autoCount }
    ].map(card => `
        <article class="stat-card">
            <span class="stat-label">${escapeHtml(card.label)}</span>
            <span class="stat-value">${escapeHtml(String(card.value))}</span>
        </article>
    `).join("");
}

function renderWorkflowList() {
    const filtered = state.workflows.filter(workflow => {
        if (!state.filter) {
            return true;
        }

        return workflow.id.toLowerCase().includes(state.filter)
            || workflow.name.toLowerCase().includes(state.filter);
    });

    if (!filtered.length) {
        workflowList.replaceChildren(createEmptyState(
            "No workflows match",
            state.filter ? "Try a different search term." : "Create your first workflow to get started."
        ));
        return;
    }

    workflowList.innerHTML = filtered.map(workflow => {
        const statuses = workflow.statuses ?? [];
        const actionCount = statuses.reduce((count, status) => count + (status.actions ?? []).length, 0);

        return `
            <article class="workflow-card ${workflow.id === state.selectedWorkflowId ? "selected" : ""}" data-workflow-id="${escapeHtml(workflow.id)}">
                <div class="workflow-card-header">
                    <div>
                        <h3 class="workflow-card-title">${escapeHtml(workflow.name)}</h3>
                        <p class="workflow-meta">${escapeHtml(workflow.id)}</p>
                    </div>
                    <span class="pill">v${escapeHtml(String(workflow.version ?? 0))}</span>
                </div>
                <div class="status-badges">
                    <span class="pill">${statuses.length} statuses</span>
                    <span class="pill">${actionCount} actions</span>
                </div>
            </article>
        `;
    }).join("");

    for (const card of workflowList.querySelectorAll("[data-workflow-id]")) {
        card.addEventListener("click", () => {
            const workflow = state.workflows.find(item => item.id === card.dataset.workflowId);
            selectWorkflow(workflow ?? null);
        });
    }
}

function renderCanvas() {
    const statuses = state.draft.statuses ?? [];
    renderConnectMode();
    applyCanvasZoom();

    if (!statuses.length) {
        canvasNodes.replaceChildren(createEmptyState(
            "No statuses yet",
            "Add a status to start drawing the workflow."
        ));
        canvasSvg.innerHTML = "";
        return;
    }

    const edges = collectEdges();
    canvasSvg.innerHTML = `
        <defs>
            <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L12,6 L0,12 z"></path>
            </marker>
        </defs>
        ${edges.map(edge => renderEdge(edge)).join("")}
    `;

    canvasNodes.innerHTML = statuses.map(status => {
        const position = state.layout[status.code];
        const selected = state.selectedStatusCode === status.code;
        const isConnectSource = state.connectionSource === status.code;

        return `
            <article
                class="status-node ${selected ? "selected" : ""} ${isConnectSource ? "connect-source" : ""}"
                data-status-code="${escapeHtml(status.code)}"
                style="transform: translate(${position.x}px, ${position.y}px);">
                <div class="status-node-header">
                    <div>
                        <h3 class="status-node-title">${escapeHtml(status.name || status.code)}</h3>
                        <p class="node-subtitle">${escapeHtml(status.code)}</p>
                    </div>
                    ${status.isTerminal ? '<span class="status-tag">Terminal</span>' : ""}
                </div>
                <div class="status-badges">
                    ${status.code === state.draft.initialStatus ? '<span class="status-tag">Initial</span>' : ""}
                    <span class="status-tag">${status.actions.length} transitions</span>
                </div>
                <div class="status-node-actions">
                    ${status.actions.length
                        ? status.actions.slice(0, 3).map(action => `
                            <button
                                class="node-transition-badge ${isActionSelected(status.code, action.code) ? "selected" : ""}"
                                type="button"
                                data-select-action="true"
                                data-status-code="${escapeHtml(status.code)}"
                                data-action-code="${escapeHtml(action.code)}">
                                ${escapeHtml(action.name || action.code)}
                            </button>
                        `).join("")
                        : '<span class="empty-inline">No transitions</span>'}
                    ${status.actions.length > 3 ? `<span class="empty-inline">+${status.actions.length - 3} more</span>` : ""}
                </div>
            </article>
        `;
    }).join("");
}

function renderEdge(edge) {
    const source = state.layout[edge.statusCode];
    const target = state.layout[edge.targetStatus];
    if (!source || !target) {
        return "";
    }

    const sourceX = source.x + NODE_WIDTH;
    const sourceY = source.y + NODE_HEIGHT / 2;
    const targetX = target.x;
    const targetY = target.y + NODE_HEIGHT / 2;
    const distance = Math.max(120, Math.abs(targetX - sourceX) * 0.5);
    const offset = (edge.index - ((edge.total - 1) / 2)) * 28;
    const controlX1 = sourceX + distance;
    const controlY1 = sourceY + offset;
    const controlX2 = targetX - distance;
    const controlY2 = targetY + offset;
    const selected = isActionSelected(edge.statusCode, edge.action.code);

    return `
        <path
            class="${selected ? "selected" : ""}"
            data-status-code="${escapeHtml(edge.statusCode)}"
            data-action-code="${escapeHtml(edge.action.code)}"
            d="M ${sourceX} ${sourceY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${targetX} ${targetY}">
        </path>
    `;
}

function renderInspector() {
    const status = getStatus(state.selectedStatusCode);
    if (!status) {
        inspectorContent.replaceChildren(createEmptyState(
            "Nothing selected",
            "Choose a status on the canvas to edit it."
        ));
        return;
    }

    const selectedAction = getSelectedAction(status);
    inspectorContent.innerHTML = `
        <div class="inspector-stack">
            <section class="inspector-card">
                <div class="inspector-card-header">
                    <div>
                        <p class="section-caption">Selected Status</p>
                        <h3>${escapeHtml(status.name || status.code)}</h3>
                    </div>
                    <div class="toolbar">
                        <button class="ghost-button" type="button" data-action="add-action" data-status-code="${escapeHtml(status.code)}">Add Transition</button>
                        <button class="danger-button" type="button" data-action="remove-status" data-status-code="${escapeHtml(status.code)}" ${state.draft.statuses.length <= 1 ? "disabled" : ""}>Delete Status</button>
                    </div>
                </div>
                <div class="inspector-actions">
                    <label class="field">
                        <span class="field-label">Status code</span>
                        <input class="text-input" type="text" data-field="status-code" data-status-code="${escapeHtml(status.code)}" value="${escapeHtml(status.code)}">
                    </label>
                    <label class="field">
                        <span class="field-label">Status name</span>
                        <input class="text-input" type="text" data-field="status-name" data-status-code="${escapeHtml(status.code)}" value="${escapeHtml(status.name)}">
                    </label>
                    <label class="field">
                        <span class="field-label">Description</span>
                        <textarea class="text-area" data-field="status-description" data-status-code="${escapeHtml(status.code)}">${escapeHtml(status.description ?? "")}</textarea>
                    </label>
                    <label class="field-inline">
                        <input type="checkbox" data-field="status-terminal" data-status-code="${escapeHtml(status.code)}" ${status.isTerminal ? "checked" : ""}>
                        <span>Mark as terminal</span>
                    </label>
                    <label class="field-inline">
                        <input type="radio" name="initial-status-radio" data-field="status-initial" data-status-code="${escapeHtml(status.code)}" ${state.draft.initialStatus === status.code ? "checked" : ""}>
                        <span>Use as initial status</span>
                    </label>
                </div>
            </section>

            <section class="inspector-card">
                <div class="section-title-row">
                    <div>
                        <p class="section-caption">Transitions</p>
                        <h3>${status.actions.length} configured</h3>
                    </div>
                </div>
                <div class="inspector-actions">
                    ${status.actions.length
                        ? status.actions.map(action => renderActionCard(status, action, selectedAction?.code === action.code)).join("")
                        : `<div class="empty-state"><p class="empty-title">No transitions yet</p><p class="empty-copy">Add one here or use Connect Statuses on the canvas.</p></div>`}
                </div>
            </section>
        </div>
    `;
}

function renderActionCard(status, action, isSelected) {
    const targetOptions = state.draft.statuses.map(option => `
        <option value="${escapeHtml(option.code)}" ${option.code === action.targetStatus ? "selected" : ""}>
            ${escapeHtml(option.name || option.code)}
        </option>
    `).join("");

    return `
        <article class="action-card ${isSelected ? "selected" : ""}">
            <div class="action-card-header">
                <div>
                    <h3>${escapeHtml(action.name || action.code)}</h3>
                    <p class="action-meta">${escapeHtml(action.code)} to ${escapeHtml(action.targetStatus)}</p>
                </div>
                <div class="toolbar">
                    <button class="ghost-button" type="button" data-action="select-action" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">Focus</button>
                    <button class="danger-button" type="button" data-action="remove-action" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">Delete</button>
                </div>
            </div>
            <div class="field-grid">
                <label class="field">
                    <span class="field-label">Action code</span>
                    <input class="text-input" type="text" data-field="action-code" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}" value="${escapeHtml(action.code)}">
                </label>
                <label class="field">
                    <span class="field-label">Action name</span>
                    <input class="text-input" type="text" data-field="action-name" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}" value="${escapeHtml(action.name)}">
                </label>
            </div>
            <div class="field-grid">
                <label class="field">
                    <span class="field-label">Target status</span>
                    <select class="field-select" data-field="action-target" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">
                        ${targetOptions}
                    </select>
                </label>
                <label class="field">
                    <span class="field-label">Mode</span>
                    <select class="field-select" data-field="action-mode" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">
                        <option value="Manual" ${action.mode === "Manual" ? "selected" : ""}>Manual</option>
                        <option value="Automatic" ${action.mode === "Automatic" ? "selected" : ""}>Automatic</option>
                    </select>
                </label>
            </div>
            <label class="field">
                <span class="field-label">Description</span>
                <textarea class="text-area" data-field="action-description" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">${escapeHtml(action.description ?? "")}</textarea>
            </label>
            <div class="section-title-row">
                <div>
                    <p class="section-caption">Conditions</p>
                    <h3>${action.conditions.length} rule${action.conditions.length === 1 ? "" : "s"}</h3>
                </div>
                <button class="ghost-button" type="button" data-action="add-condition" data-status-code="${escapeHtml(status.code)}" data-action-code="${escapeHtml(action.code)}">Add Condition</button>
            </div>
            <div class="inspector-actions">
                ${action.conditions.length
                    ? action.conditions.map((condition, index) => renderConditionCard(status.code, action.code, condition, index)).join("")
                    : '<p class="empty-inline">This transition always qualifies.</p>'}
            </div>
        </article>
    `;
}

function renderConditionCard(statusCode, actionCode, condition, index) {
    return `
        <section class="condition-card">
            <div class="condition-grid">
                <label class="field">
                    <span class="field-label">Key</span>
                    <input class="text-input" type="text" data-field="condition-key" data-status-code="${escapeHtml(statusCode)}" data-action-code="${escapeHtml(actionCode)}" data-condition-index="${index}" value="${escapeHtml(condition.key)}">
                </label>
                <label class="field">
                    <span class="field-label">Operator</span>
                    <select class="field-select" data-field="condition-operator" data-status-code="${escapeHtml(statusCode)}" data-action-code="${escapeHtml(actionCode)}" data-condition-index="${index}">
                        ${["Equals", "NotEquals", "Exists", "Missing"].map(operator => `
                            <option value="${operator}" ${condition.operator === operator ? "selected" : ""}>${operator}</option>
                        `).join("")}
                    </select>
                </label>
                <label class="field">
                    <span class="field-label">Expected value</span>
                    <input class="text-input" type="text" data-field="condition-value" data-status-code="${escapeHtml(statusCode)}" data-action-code="${escapeHtml(actionCode)}" data-condition-index="${index}" value="${escapeHtml(condition.expectedValue ?? "")}">
                </label>
            </div>
            <div class="condition-actions">
                <button class="danger-button" type="button" data-action="remove-condition" data-status-code="${escapeHtml(statusCode)}" data-action-code="${escapeHtml(actionCode)}" data-condition-index="${index}">Delete Condition</button>
            </div>
        </section>
    `;
}

function renderJsonPreview() {
    try {
        workflowJsonPreview.textContent = JSON.stringify(serializeDraft(), null, 2);
    } catch (error) {
        workflowJsonPreview.textContent = error.message;
    }
}

function renderConnectMode() {
    connectButton.classList.toggle("active", state.connectMode);
    if (!state.connectMode) {
        canvasModeLabel.textContent = "";
        return;
    }

    canvasModeLabel.textContent = state.connectionSource
        ? `Connecting from ${state.connectionSource}. Click a target status to create a transition.`
        : "Connect mode is on. Click a source status, then a target status.";
}

function handleConnectSelection(statusCode) {
    if (!state.connectionSource) {
        state.connectionSource = statusCode;
        renderConnectMode();
        renderCanvas();
        return;
    }

    if (state.connectionSource === statusCode) {
        state.connectionSource = null;
        renderConnectMode();
        renderCanvas();
        return;
    }

    const action = addAction(state.connectionSource, statusCode);
    state.selectedStatusCode = state.connectionSource;
    state.selectedActionRef = { statusCode: state.connectionSource, actionCode: action.code };
    state.connectionSource = null;
    state.connectMode = false;
    renderDraft();
}

function handleInspectorFieldInput(field, statusCode, actionCode, conditionIndex, target) {
    switch (field) {
        case "status-code":
            renameStatus(statusCode, target.value);
            return;
        case "status-name":
            updateStatus(statusCode, status => {
                status.name = target.value;
            }, { includeWorkflowList: false });
            return;
        case "status-description":
            updateStatus(statusCode, status => {
                status.description = target.value;
            }, { includeWorkflowList: false });
            return;
        case "status-terminal":
            updateStatus(statusCode, status => {
                status.isTerminal = target.checked;
            }, { fullRender: true });
            return;
        case "status-initial":
            state.draft.initialStatus = statusCode;
            renderDerivedState();
            renderInspector();
            return;
        case "action-code":
            renameAction(statusCode, actionCode, target.value);
            return;
        case "action-name":
            updateAction(statusCode, actionCode, action => {
                action.name = target.value;
            });
            return;
        case "action-description":
            updateAction(statusCode, actionCode, action => {
                action.description = target.value;
            });
            return;
        case "action-target":
            updateAction(statusCode, actionCode, action => {
                action.targetStatus = target.value;
            }, { fullRender: true });
            return;
        case "action-mode":
            updateAction(statusCode, actionCode, action => {
                action.mode = target.value;
            }, { fullRender: true });
            return;
        case "condition-key":
            updateCondition(statusCode, actionCode, conditionIndex, condition => {
                condition.key = target.value;
            });
            return;
        case "condition-operator":
            updateCondition(statusCode, actionCode, conditionIndex, condition => {
                condition.operator = target.value;
            });
            return;
        case "condition-value":
            updateCondition(statusCode, actionCode, conditionIndex, condition => {
                condition.expectedValue = target.value;
            });
            return;
        default:
            return;
    }
}

function updateStatus(statusCode, updater, options = {}) {
    const status = getStatus(statusCode);
    if (!status) {
        return;
    }

    updater(status);
    if (options.fullRender) {
        renderDraft();
        return;
    }

    renderDerivedState({ includeWorkflowList: !!options.includeWorkflowList });
}

function updateAction(statusCode, actionCode, updater, options = {}) {
    const action = getAction(statusCode, actionCode);
    if (!action) {
        return;
    }

    updater(action);
    if (options.fullRender) {
        renderDraft();
        return;
    }

    renderDerivedState();
}

function updateCondition(statusCode, actionCode, conditionIndex, updater, options = {}) {
    const action = getAction(statusCode, actionCode);
    const condition = action?.conditions?.[conditionIndex];
    if (!condition) {
        return;
    }

    updater(condition);
    if (options.fullRender) {
        renderDraft();
        return;
    }

    renderDerivedState();
}

function renameStatus(oldCode, requestedCode) {
    const status = getStatus(oldCode);
    if (!status) {
        return;
    }

    const nextCode = slugifyIdentifier(requestedCode || oldCode);
    if (!nextCode || nextCode === oldCode) {
        status.code = requestedCode.trim() ? nextCode : oldCode;
        renderDraft();
        return;
    }

    if (state.draft.statuses.some(item => item.code === nextCode)) {
        setMessage(`Status code '${nextCode}' already exists.`, true);
        return;
    }

    status.code = nextCode;
    if (!status.name || status.name === oldCode) {
        status.name = nextCode;
    }

    if (state.draft.initialStatus === oldCode) {
        state.draft.initialStatus = nextCode;
    }

    for (const candidate of state.draft.statuses) {
        for (const action of candidate.actions) {
            if (action.targetStatus === oldCode) {
                action.targetStatus = nextCode;
            }
        }
    }

    if (state.layout[oldCode]) {
        state.layout[nextCode] = state.layout[oldCode];
        delete state.layout[oldCode];
    }

    if (state.selectedStatusCode === oldCode) {
        state.selectedStatusCode = nextCode;
    }

    if (state.selectedActionRef?.statusCode === oldCode) {
        state.selectedActionRef.statusCode = nextCode;
    }

    persistLayout();
    setMessage("");
    renderDraft();
}

function renameAction(statusCode, oldCode, requestedCode) {
    const action = getAction(statusCode, oldCode);
    const status = getStatus(statusCode);
    if (!action || !status) {
        return;
    }

    const nextCode = slugifyIdentifier(requestedCode || oldCode);
    if (!nextCode || nextCode === oldCode) {
        action.code = requestedCode.trim() ? nextCode : oldCode;
        renderDraft();
        return;
    }

    if (status.actions.some(item => item.code === nextCode)) {
        setMessage(`Action code '${nextCode}' already exists in ${statusCode}.`, true);
        return;
    }

    action.code = nextCode;
    if (!action.name || action.name === oldCode) {
        action.name = titleFromCode(nextCode);
    }

    if (isActionSelected(statusCode, oldCode)) {
        state.selectedActionRef = { statusCode, actionCode: nextCode };
    }

    setMessage("");
    renderDraft();
}

function removeStatus(statusCode) {
    if (state.draft.statuses.length <= 1) {
        return;
    }

    state.draft.statuses = state.draft.statuses.filter(status => status.code !== statusCode);
    for (const status of state.draft.statuses) {
        status.actions = status.actions.filter(action => action.targetStatus !== statusCode);
    }

    delete state.layout[statusCode];
    ensureInitialStatus();
    state.selectedStatusCode = state.draft.statuses[0]?.code ?? null;
    state.selectedActionRef = null;
    persistLayout();
    renderDraft();
}

function addAction(statusCode, targetStatusCode = null) {
    const status = getStatus(statusCode);
    if (!status) {
        throw new Error(`Status '${statusCode}' was not found.`);
    }

    const targetStatus = targetStatusCode ?? nextTargetStatus(statusCode);
    const code = uniqueActionCode(status, targetStatus);
    const action = {
        code,
        name: titleFromCode(code),
        description: "",
        targetStatus,
        mode: "Manual",
        conditions: []
    };

    status.actions.push(action);
    state.selectedStatusCode = statusCode;
    state.selectedActionRef = { statusCode, actionCode: action.code };
    renderDraft();
    return action;
}

function removeAction(statusCode, actionCode) {
    const status = getStatus(statusCode);
    if (!status) {
        return;
    }

    status.actions = status.actions.filter(action => action.code !== actionCode);
    if (isActionSelected(statusCode, actionCode)) {
        state.selectedActionRef = null;
    }

    renderDraft();
}

function addCondition(statusCode, actionCode) {
    const action = getAction(statusCode, actionCode);
    if (!action) {
        return;
    }

    action.conditions.push({
        key: "",
        operator: "Equals",
        expectedValue: ""
    });
    renderDraft();
}

function removeCondition(statusCode, actionCode, conditionIndex) {
    const action = getAction(statusCode, actionCode);
    if (!action) {
        return;
    }

    action.conditions.splice(conditionIndex, 1);
    renderDraft();
}

function selectAction(statusCode, actionCode) {
    state.selectedStatusCode = statusCode;
    state.selectedActionRef = { statusCode, actionCode };
    renderCanvas();
    renderInspector();
}

function collectEdges() {
    const grouped = new Map();

    for (const status of state.draft.statuses) {
        for (const action of status.actions) {
            const key = `${status.code}->${action.targetStatus}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }

            grouped.get(key).push({ statusCode: status.code, action });
        }
    }

    return [...grouped.values()].flatMap(group =>
        group.map((item, index) => ({
            ...item,
            targetStatus: item.action.targetStatus,
            index,
            total: group.length
        }))
    );
}

function serializeDraft() {
    const selectedWorkflow = getSelectedWorkflow();
    const workflow = {
        id: state.draft.id.trim(),
        version: selectedWorkflow?.id === state.draft.id ? selectedWorkflow.version ?? 0 : 0,
        name: state.draft.name.trim(),
        description: state.draft.description?.trim() ?? "",
        initialStatus: state.draft.initialStatus,
        statuses: state.draft.statuses.map(status => ({
            code: status.code.trim(),
            name: status.name.trim(),
            description: status.description?.trim() ?? "",
            isTerminal: !!status.isTerminal,
            actions: status.actions.map(action => ({
                code: action.code.trim(),
                name: action.name.trim(),
                description: action.description?.trim() ?? "",
                targetStatus: action.targetStatus,
                mode: action.mode,
                conditions: action.conditions.map(condition => ({
                    key: condition.key.trim(),
                    operator: condition.operator,
                    expectedValue: condition.expectedValue?.trim() ?? ""
                }))
            }))
        }))
    };

    return workflow;
}

function syncDraftFromVisibleEditors() {
    state.draft.id = workflowIdInput.value.trim();
    state.draft.name = workflowNameInput.value.trim();
    state.draft.description = workflowDescriptionInput.value;
    state.draft.initialStatus = workflowInitialStatusInput.value || state.draft.initialStatus;

    for (const fieldElement of inspectorContent.querySelectorAll("[data-field]")) {
        applyVisibleFieldValue(fieldElement);
    }
}

function applyVisibleFieldValue(fieldElement) {
    const field = fieldElement.dataset.field;
    const statusCode = fieldElement.dataset.statusCode;
    const actionCode = fieldElement.dataset.actionCode ?? null;
    const conditionIndex = fieldElement.dataset.conditionIndex ? Number(fieldElement.dataset.conditionIndex) : null;

    switch (field) {
        case "status-code":
            applyStatusCodeValue(statusCode, fieldElement.value);
            return;
        case "status-name":
            writeStatusValue(statusCode, status => {
                status.name = fieldElement.value;
            });
            return;
        case "status-description":
            writeStatusValue(statusCode, status => {
                status.description = fieldElement.value;
            });
            return;
        case "status-terminal":
            writeStatusValue(statusCode, status => {
                status.isTerminal = fieldElement.checked;
            });
            return;
        case "status-initial":
            if (fieldElement.checked) {
                state.draft.initialStatus = statusCode;
            }
            return;
        case "action-code":
            applyActionCodeValue(statusCode, actionCode, fieldElement.value);
            return;
        case "action-name":
            writeActionValue(statusCode, actionCode, action => {
                action.name = fieldElement.value;
            });
            return;
        case "action-description":
            writeActionValue(statusCode, actionCode, action => {
                action.description = fieldElement.value;
            });
            return;
        case "action-target":
            writeActionValue(statusCode, actionCode, action => {
                action.targetStatus = fieldElement.value;
            });
            return;
        case "action-mode":
            writeActionValue(statusCode, actionCode, action => {
                action.mode = fieldElement.value;
            });
            return;
        case "condition-key":
            writeConditionValue(statusCode, actionCode, conditionIndex, condition => {
                condition.key = fieldElement.value;
            });
            return;
        case "condition-operator":
            writeConditionValue(statusCode, actionCode, conditionIndex, condition => {
                condition.operator = fieldElement.value;
            });
            return;
        case "condition-value":
            writeConditionValue(statusCode, actionCode, conditionIndex, condition => {
                condition.expectedValue = fieldElement.value;
            });
            return;
        default:
            return;
    }
}

function validateWorkflow(workflow) {
    if (!workflow.id) {
        throw new Error("Workflow ID is required.");
    }

    if (!workflow.name) {
        throw new Error("Workflow name is required.");
    }

    if (!workflow.statuses.length) {
        throw new Error("At least one status is required.");
    }

    const statusCodes = new Set();
    for (const status of workflow.statuses) {
        if (!status.code) {
            throw new Error("Each status needs a code.");
        }

        if (statusCodes.has(status.code)) {
            throw new Error(`Duplicate status code '${status.code}'.`);
        }

        statusCodes.add(status.code);

        if (!status.name) {
            throw new Error(`Status '${status.code}' needs a name.`);
        }

        const actionCodes = new Set();
        for (const action of status.actions) {
            if (!action.code) {
                throw new Error(`A transition in '${status.code}' needs a code.`);
            }

            if (actionCodes.has(action.code)) {
                throw new Error(`Duplicate action code '${action.code}' in status '${status.code}'.`);
            }

            actionCodes.add(action.code);

            if (!action.name) {
                throw new Error(`Action '${action.code}' in '${status.code}' needs a name.`);
            }

            if (!statusCodes.has(action.targetStatus) && !workflow.statuses.some(item => item.code === action.targetStatus)) {
                throw new Error(`Action '${action.code}' points to unknown status '${action.targetStatus}'.`);
            }

            for (const condition of action.conditions) {
                if (!condition.key && !["Exists", "Missing"].includes(condition.operator)) {
                    throw new Error(`A condition in action '${action.code}' needs a key.`);
                }
            }
        }
    }

    if (!statusCodes.has(workflow.initialStatus)) {
        throw new Error("Initial status must reference an existing status.");
    }
}

function findPersistenceMismatches(expectedWorkflow, persistedWorkflow) {
    const expected = comparableWorkflow(expectedWorkflow);
    const actual = comparableWorkflow(persistedWorkflow);
    const mismatches = [];

    if (JSON.stringify(expected) === JSON.stringify(actual)) {
        return mismatches;
    }

    if (expected.id !== actual.id) mismatches.push("id");
    if (expected.name !== actual.name) mismatches.push("name");
    if (expected.description !== actual.description) mismatches.push("description");
    if (expected.initialStatus !== actual.initialStatus) mismatches.push("initialStatus");
    if (expected.statuses.length !== actual.statuses.length) mismatches.push("statuses.length");

    expected.statuses.forEach((status, index) => {
        const actualStatus = actual.statuses[index];
        if (!actualStatus) {
            return;
        }

        if (status.code !== actualStatus.code) mismatches.push(`statuses[${index}].code`);
        if (status.name !== actualStatus.name) mismatches.push(`statuses[${index}].name`);
        if (status.description !== actualStatus.description) mismatches.push(`statuses[${index}].description`);
        if (status.isTerminal !== actualStatus.isTerminal) mismatches.push(`statuses[${index}].isTerminal`);
        if (status.actions.length !== actualStatus.actions.length) mismatches.push(`statuses[${index}].actions.length`);

        status.actions.forEach((action, actionIndex) => {
            const actualAction = actualStatus.actions[actionIndex];
            if (!actualAction) {
                return;
            }

            if (action.code !== actualAction.code) mismatches.push(`statuses[${index}].actions[${actionIndex}].code`);
            if (action.name !== actualAction.name) mismatches.push(`statuses[${index}].actions[${actionIndex}].name`);
            if (action.description !== actualAction.description) mismatches.push(`statuses[${index}].actions[${actionIndex}].description`);
            if (action.targetStatus !== actualAction.targetStatus) mismatches.push(`statuses[${index}].actions[${actionIndex}].targetStatus`);
            if (action.mode !== actualAction.mode) mismatches.push(`statuses[${index}].actions[${actionIndex}].mode`);
            if (action.conditions.length !== actualAction.conditions.length) mismatches.push(`statuses[${index}].actions[${actionIndex}].conditions.length`);

            action.conditions.forEach((condition, conditionIndex) => {
                const actualCondition = actualAction.conditions[conditionIndex];
                if (!actualCondition) {
                    return;
                }

                if (condition.key !== actualCondition.key) mismatches.push(`statuses[${index}].actions[${actionIndex}].conditions[${conditionIndex}].key`);
                if (condition.operator !== actualCondition.operator) mismatches.push(`statuses[${index}].actions[${actionIndex}].conditions[${conditionIndex}].operator`);
                if (condition.expectedValue !== actualCondition.expectedValue) mismatches.push(`statuses[${index}].actions[${actionIndex}].conditions[${conditionIndex}].expectedValue`);
            });
        });
    });

    return [...new Set(mismatches)];
}

function comparableWorkflow(workflow) {
    const normalized = normalizeWorkflow(workflow);
    return {
        id: normalized.id ?? "",
        name: normalized.name ?? "",
        description: normalized.description ?? "",
        initialStatus: normalized.initialStatus ?? "",
        statuses: normalized.statuses.map(status => ({
            code: status.code ?? "",
            name: status.name ?? "",
            description: status.description ?? "",
            isTerminal: !!status.isTerminal,
            actions: status.actions.map(action => ({
                code: action.code ?? "",
                name: action.name ?? "",
                description: action.description ?? "",
                targetStatus: action.targetStatus ?? "",
                mode: action.mode ?? "Manual",
                conditions: action.conditions.map(condition => ({
                    key: condition.key ?? "",
                    operator: condition.operator ?? "Equals",
                    expectedValue: condition.expectedValue ?? ""
                }))
            }))
        }))
    };
}

function normalizeWorkflow(workflow) {
    const normalized = {
        id: workflow.id ?? "",
        version: workflow.version ?? 0,
        name: workflow.name ?? "",
        description: workflow.description ?? "",
        initialStatus: workflow.initialStatus ?? workflow.statuses?.[0]?.code ?? "",
        statuses: (workflow.statuses ?? []).map(status => ({
            code: status.code ?? "",
            name: status.name ?? status.code ?? "",
            description: status.description ?? "",
            isTerminal: !!status.isTerminal,
            actions: (status.actions ?? []).map(action => ({
                code: action.code ?? "",
                name: action.name ?? action.code ?? "",
                description: action.description ?? "",
                targetStatus: action.targetStatus ?? "",
                mode: action.mode ?? "Manual",
                conditions: (action.conditions ?? []).map(condition => ({
                    key: condition.key ?? "",
                    operator: condition.operator ?? "Equals",
                    expectedValue: condition.expectedValue ?? ""
                }))
            }))
        }))
    };

    if (!normalized.statuses.length) {
        normalized.statuses = emptyWorkflow().statuses;
    }

    if (!normalized.statuses.some(status => status.code === normalized.initialStatus)) {
        normalized.initialStatus = normalized.statuses[0].code;
    }

    return normalized;
}

function writeStatusValue(statusCode, updater) {
    const status = getStatus(statusCode);
    if (!status) {
        return;
    }

    updater(status);
}

function writeActionValue(statusCode, actionCode, updater) {
    const action = getAction(statusCode, actionCode);
    if (!action) {
        return;
    }

    updater(action);
}

function writeConditionValue(statusCode, actionCode, conditionIndex, updater) {
    const action = getAction(statusCode, actionCode);
    const condition = action?.conditions?.[conditionIndex];
    if (!condition) {
        return;
    }

    updater(condition);
}

function applyStatusCodeValue(oldCode, requestedCode) {
    const status = getStatus(oldCode);
    if (!status) {
        return;
    }

    const nextCode = slugifyIdentifier(requestedCode || oldCode);
    if (!nextCode || nextCode === oldCode) {
        status.code = requestedCode.trim() ? nextCode : oldCode;
        return;
    }

    if (state.draft.statuses.some(item => item.code === nextCode)) {
        return;
    }

    status.code = nextCode;
    if (!status.name || status.name === oldCode) {
        status.name = nextCode;
    }

    if (state.draft.initialStatus === oldCode) {
        state.draft.initialStatus = nextCode;
    }

    for (const candidate of state.draft.statuses) {
        for (const action of candidate.actions) {
            if (action.targetStatus === oldCode) {
                action.targetStatus = nextCode;
            }
        }
    }

    if (state.layout[oldCode]) {
        state.layout[nextCode] = state.layout[oldCode];
        delete state.layout[oldCode];
    }

    if (state.selectedStatusCode === oldCode) {
        state.selectedStatusCode = nextCode;
    }

    if (state.selectedActionRef?.statusCode === oldCode) {
        state.selectedActionRef.statusCode = nextCode;
    }
}

function applyActionCodeValue(statusCode, oldCode, requestedCode) {
    const action = getAction(statusCode, oldCode);
    const status = getStatus(statusCode);
    if (!action || !status) {
        return;
    }

    const nextCode = slugifyIdentifier(requestedCode || oldCode);
    if (!nextCode || nextCode === oldCode) {
        action.code = requestedCode.trim() ? nextCode : oldCode;
        return;
    }

    if (status.actions.some(item => item.code === nextCode)) {
        return;
    }

    action.code = nextCode;
    if (!action.name || action.name === oldCode) {
        action.name = titleFromCode(nextCode);
    }

    if (isActionSelected(statusCode, oldCode)) {
        state.selectedActionRef = { statusCode, actionCode: nextCode };
    }
}

function emptyWorkflow() {
    return {
        id: "",
        version: 0,
        name: "",
        description: "",
        initialStatus: "Draft",
        statuses: [
            {
                code: "Draft",
                name: "Draft",
                description: "",
                isTerminal: false,
                actions: []
            }
        ]
    };
}

function createStatus() {
    const nextCode = uniqueStatusCode();
    return {
        code: nextCode,
        name: titleFromCode(nextCode),
        description: "",
        isTerminal: false,
        actions: []
    };
}

function ensureInitialStatus() {
    if (!state.draft.statuses.some(status => status.code === state.draft.initialStatus)) {
        state.draft.initialStatus = state.draft.statuses[0]?.code ?? "";
    }
}

function getSelectedWorkflow() {
    return state.workflows.find(workflow => workflow.id === state.selectedWorkflowId) ?? null;
}

function getStatus(statusCode) {
    return state.draft.statuses.find(status => status.code === statusCode) ?? null;
}

function getAction(statusCode, actionCode) {
    return getStatus(statusCode)?.actions.find(action => action.code === actionCode) ?? null;
}

function getSelectedAction(status) {
    if (!state.selectedActionRef || state.selectedActionRef.statusCode !== status.code) {
        return null;
    }

    return status.actions.find(action => action.code === state.selectedActionRef.actionCode) ?? null;
}

function isActionSelected(statusCode, actionCode) {
    return state.selectedActionRef?.statusCode === statusCode
        && state.selectedActionRef?.actionCode === actionCode;
}

function autoLayout() {
    const columns = Math.max(1, Math.ceil(Math.sqrt(state.draft.statuses.length)));
    const horizontalGap = 280;
    const verticalGap = 210;
    const startX = 90;
    const startY = 80;

    state.draft.statuses.forEach((status, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        state.layout[status.code] = {
            x: startX + column * horizontalGap,
            y: startY + row * verticalGap
        };
    });
}

function centeredPosition() {
    const count = state.draft.statuses.length;
    return {
        x: clamp(120 + ((count - 1) % 4) * 260, 24, CANVAS_WIDTH - NODE_WIDTH - 24),
        y: clamp(120 + Math.floor((count - 1) / 4) * 190, 24, CANVAS_HEIGHT - NODE_HEIGHT - 24)
    };
}

function normalizeLayout(layout, statuses) {
    const result = {};
    const incoming = layout ?? {};

    statuses.forEach((status, index) => {
        const position = incoming[status.code];
        result[status.code] = position
            ? {
                x: clamp(Number(position.x) || 0, 24, CANVAS_WIDTH - NODE_WIDTH - 24),
                y: clamp(Number(position.y) || 0, 24, CANVAS_HEIGHT - NODE_HEIGHT - 24)
            }
            : {
                x: clamp(80 + (index % 4) * 260, 24, CANVAS_WIDTH - NODE_WIDTH - 24),
                y: clamp(80 + Math.floor(index / 4) * 190, 24, CANVAS_HEIGHT - NODE_HEIGHT - 24)
            };
    });

    return result;
}

function loadLayout(workflowId) {
    try {
        const allLayouts = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}");
        return allLayouts[layoutKey(workflowId)] ?? {};
    } catch {
        return {};
    }
}

function persistLayout(explicitWorkflowId = null) {
    try {
        const allLayouts = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}");
        allLayouts[layoutKey(explicitWorkflowId ?? state.draft.id)] = state.layout;
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(allLayouts));
    } catch {
        // Ignore local storage failures in private browsing or restricted environments.
    }
}

function deleteLayout(workflowId) {
    try {
        const allLayouts = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}");
        delete allLayouts[layoutKey(workflowId)];
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(allLayouts));
    } catch {
        // Ignore local storage failures.
    }
}

function layoutKey(workflowId) {
    return workflowId || "__new__";
}

function uniqueStatusCode() {
    const existing = new Set(state.draft.statuses.map(status => status.code));
    let index = state.draft.statuses.length + 1;
    let candidate = `Status${index}`;
    while (existing.has(candidate)) {
        index += 1;
        candidate = `Status${index}`;
    }

    return candidate;
}

function uniqueActionCode(status, targetStatus) {
    const base = `TO_${slugifyIdentifier(targetStatus || "status")}`;
    const existing = new Set(status.actions.map(action => action.code));
    let candidate = base;
    let index = 2;
    while (existing.has(candidate)) {
        candidate = `${base}_${index}`;
        index += 1;
    }

    return candidate;
}

function nextTargetStatus(statusCode) {
    const nextStatus = state.draft.statuses.find(status => status.code !== statusCode);
    return nextStatus?.code ?? statusCode;
}

function slugifyIdentifier(value) {
    return String(value)
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .replace(/^_+|_+$/g, "");
}

function titleFromCode(value) {
    return String(value)
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
}

function setBusy(isBusy) {
    refreshButton.disabled = isBusy;
    newWorkflowButton.disabled = isBusy;
    addStatusButton.disabled = isBusy;
    connectButton.disabled = isBusy;
    autoLayoutButton.disabled = isBusy;
    deleteButton.disabled = isBusy || !getSelectedWorkflow();
}

function setMessage(message, isError = false) {
    formMessage.textContent = message;
    formMessage.className = `message-banner${message ? isError ? " error" : " success" : ""}`;
}

function createEmptyState(title, copy) {
    const template = document.getElementById("empty-state-template");
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".empty-title").textContent = title;
    fragment.querySelector(".empty-copy").textContent = copy;
    return fragment;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setZoom(nextZoom) {
    state.zoom = clamp(Number(nextZoom) || 1, MIN_ZOOM, MAX_ZOOM);
    applyCanvasZoom();
}

function applyCanvasZoom() {
    const scaledWidth = CANVAS_WIDTH * state.zoom;
    const scaledHeight = CANVAS_HEIGHT * state.zoom;
    canvasContent.style.transform = `scale(${state.zoom})`;
    canvas.style.minHeight = `${Math.max(760, scaledHeight)}px`;
    canvasContent.style.marginBottom = `${Math.max(0, scaledHeight - CANVAS_HEIGHT)}px`;
    canvasContent.style.marginRight = `${Math.max(0, scaledWidth - CANVAS_WIDTH)}px`;
    zoomResetButton.textContent = `${Math.round(state.zoom * 100)}%`;
    zoomOutButton.disabled = state.zoom <= MIN_ZOOM;
    zoomInButton.disabled = state.zoom >= MAX_ZOOM;
}

function shouldDeferInspectorField(field, target) {
    return field === "status-code"
        || field === "action-code"
        || target.type === "checkbox"
        || target.type === "radio"
        || target.tagName === "SELECT";
}
