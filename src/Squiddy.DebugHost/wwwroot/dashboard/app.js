const state = {
    workflows: [],
    selectedWorkflowId: null,
    filter: ""
};

const workflowList = document.getElementById("workflow-list");
const workflowSearch = document.getElementById("workflow-search");
const workflowForm = document.getElementById("workflow-form");
const workflowIdInput = document.getElementById("workflow-id");
const workflowNameInput = document.getElementById("workflow-name");
const workflowStatusesInput = document.getElementById("workflow-statuses");
const previewSummary = document.getElementById("preview-summary");
const previewStatuses = document.getElementById("preview-statuses");
const refreshButton = document.getElementById("refresh-button");
const newWorkflowButton = document.getElementById("new-workflow-button");
const resetButton = document.getElementById("reset-button");
const deleteButton = document.getElementById("delete-button");
const editorTitle = document.getElementById("editor-title");
const formMessage = document.getElementById("form-message");

workflowSearch.addEventListener("input", () => {
    state.filter = workflowSearch.value.trim().toLowerCase();
    renderWorkflowList();
});

workflowForm.addEventListener("submit", async event => {
    event.preventDefault();
    await saveWorkflow();
});

workflowStatusesInput.addEventListener("input", renderPreviewFromForm);
workflowNameInput.addEventListener("input", renderPreviewFromForm);
workflowIdInput.addEventListener("input", renderPreviewFromForm);
refreshButton.addEventListener("click", loadWorkflows);
newWorkflowButton.addEventListener("click", () => selectWorkflow(null));
resetButton.addEventListener("click", () => {
    const selected = getSelectedWorkflow();
    if (selected) {
        populateForm(selected);
        setMessage("");
    } else {
        selectWorkflow(null);
    }
});
deleteButton.addEventListener("click", deleteCurrentWorkflow);

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
        if (selected) {
            populateForm(selected);
        } else {
            selectWorkflow(null);
        }
    } catch (error) {
        setMessage(`Failed to load workflows. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function saveWorkflow() {
    let workflow;

    try {
        workflow = workflowFromForm();
    } catch (error) {
        setMessage(error.message, true);
        return;
    }

    setBusy(true);
    setMessage("Saving workflow...");

    try {
        await fetchJson("/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow })
        });

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

        state.selectedWorkflowId = null;
        await loadWorkflows();
        setMessage(`Workflow '${workflow.id}' deleted.`);
    } catch (error) {
        setMessage(`Delete failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
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
                    <span class="pill">${statuses.length} statuses</span>
                </div>
                <div class="card-actions">
                    <span class="pill">${actionCount} actions</span>
                </div>
            </article>
        `;
    }).join("");

    for (const card of workflowList.querySelectorAll("[data-workflow-id]")) {
        card.addEventListener("click", () => {
            state.selectedWorkflowId = card.dataset.workflowId;
            populateForm(getSelectedWorkflow());
            renderWorkflowList();
        });
    }
}

function selectWorkflow(workflow) {
    state.selectedWorkflowId = workflow?.id ?? null;
    populateForm(workflow ?? emptyWorkflow());
    renderWorkflowList();
}

function populateForm(workflow) {
    const isNew = !workflow.id || !state.workflows.some(existing => existing.id === workflow.id);
    editorTitle.textContent = isNew ? "Create workflow" : `Edit ${workflow.name}`;
    workflowIdInput.value = workflow.id ?? "";
    workflowNameInput.value = workflow.name ?? "";
    workflowStatusesInput.value = formatStatuses(workflow.statuses ?? []);
    deleteButton.disabled = isNew;
    renderPreviewFromForm();
}

function renderPreviewFromForm() {
    try {
        const workflow = workflowFromForm(false);
        renderPreview(workflow);
        setMessage("");
    } catch (error) {
        previewSummary.innerHTML = "";
        previewStatuses.replaceChildren(createEmptyState(
            "Preview unavailable",
            error.message
        ));
    }
}

function renderPreview(workflow) {
    const statuses = workflow.statuses ?? [];
    const actionCount = statuses.reduce((count, status) => count + (status.actions ?? []).length, 0);
    const stpCount = statuses.reduce(
        (count, status) => count + (status.actions ?? []).filter(action => action.isStraightThroughProcessing).length,
        0);

    previewSummary.innerHTML = [
        { label: "Statuses", value: statuses.length },
        { label: "Actions", value: actionCount },
        { label: "STP", value: stpCount }
    ].map(card => `
        <article class="stat-card">
            <span class="stat-label">${escapeHtml(card.label)}</span>
            <span class="stat-value">${escapeHtml(String(card.value))}</span>
        </article>
    `).join("");

    if (!statuses.length) {
        previewStatuses.replaceChildren(createEmptyState(
            "No statuses configured",
            "Add at least one status in the JSON editor."
        ));
        return;
    }

    previewStatuses.innerHTML = statuses.map(status => `
        <article class="preview-card">
            <h3>${escapeHtml(status.name)}</h3>
            <p class="status-meta">${escapeHtml(status.code)}</p>
            <div class="status-tags">
                <span class="status-tag">${(status.actions ?? []).length} actions</span>
            </div>
            <div class="status-actions">
                ${(status.actions ?? []).length
                    ? status.actions.map(action => `
                        <div class="action-row">
                            <div class="action-header">
                                <span class="action-title">${escapeHtml(action.name)}</span>
                                <span class="pill">${escapeHtml(action.targetStatus)}</span>
                            </div>
                            <p class="status-meta">${escapeHtml(action.code)}${action.isStraightThroughProcessing ? " · STP" : ""}</p>
                            <p class="status-meta">
                                ${(action.conditions ?? []).length
                                    ? escapeHtml(action.conditions.map(condition => `${condition.key} ${condition.operator} ${condition.expectedValue ?? ""}`.trim()).join(" | "))
                                    : "No conditions"}
                            </p>
                        </div>
                    `).join("")
                    : '<div class="action-row"><p class="status-meta">No actions configured for this status.</p></div>'}
            </div>
        </article>
    `).join("");
}

function workflowFromForm(requireIdentity = true) {
    const id = workflowIdInput.value.trim();
    const name = workflowNameInput.value.trim();

    if (requireIdentity && !id) {
        throw new Error("Workflow ID is required.");
    }

    if (requireIdentity && !name) {
        throw new Error("Workflow name is required.");
    }

    let statuses;

    try {
        statuses = JSON.parse(workflowStatusesInput.value || "[]");
    } catch (error) {
        throw new Error(`Statuses JSON is invalid. ${error.message}`);
    }

    if (!Array.isArray(statuses)) {
        throw new Error("Statuses JSON must be an array.");
    }

    return {
        id,
        name,
        statuses
    };
}

function emptyWorkflow() {
    return {
        id: "",
        name: "",
        statuses: [
            {
                code: "Draft",
                name: "Draft",
                actions: []
            }
        ]
    };
}

function getSelectedWorkflow() {
    return state.workflows.find(workflow => workflow.id === state.selectedWorkflowId) ?? null;
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
}

function formatStatuses(statuses) {
    return JSON.stringify(statuses, null, 2);
}

function setBusy(isBusy) {
    refreshButton.disabled = isBusy;
    newWorkflowButton.disabled = isBusy;
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
