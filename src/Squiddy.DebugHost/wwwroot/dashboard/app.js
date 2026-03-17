const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;
const LAYOUT_STORAGE_KEY = "squiddy.workflow.layout.v1";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;

const state = {
    categories: [],
    selectedCategoryId: null,
    categoryDraft: emptyCategory(),
    workflows: [],
    selectedWorkflowId: null,
    selectedWorkflowVersion: null,
    versionHistory: [],
    filter: "",
    draft: emptyWorkflow(),
    layout: {},
    selectedStatusCode: "Draft",
    selectedActionRef: null,
    connectMode: false,
    connectionSource: null,
    drag: null,
    zoom: 1,
    isBusy: false,
    isEditingDetachedVersion: false
};

const workflowList = document.getElementById("workflow-list");
const workflowSearch = document.getElementById("workflow-search");
const workflowForm = document.getElementById("workflow-form");
const workflowIdInput = document.getElementById("workflow-id");
const workflowCategoryInput = document.getElementById("workflow-category");
const categoryIdInput = document.getElementById("category-id");
const categoryNameInput = document.getElementById("category-name");
const categoryDescriptionInput = document.getElementById("category-description");
const workflowNameInput = document.getElementById("workflow-name");
const workflowDescriptionInput = document.getElementById("workflow-description");
const workflowInitialStatusInput = document.getElementById("workflow-initial-status");
const previewSummary = document.getElementById("preview-summary");
const workflowJsonPreview = document.getElementById("workflow-json-preview");
const categoryList = document.getElementById("category-list");
const workflowVersionSelect = document.getElementById("workflow-version-select");
const workflowVersionSummary = document.getElementById("workflow-version-summary");
const refreshButton = document.getElementById("refresh-button");
const newWorkflowButton = document.getElementById("new-workflow-button");
const resetButton = document.getElementById("reset-button");
const deleteButton = document.getElementById("delete-button");
const addCategoryButton = document.getElementById("add-category-button");
const editCategoryButton = document.getElementById("edit-category-button");
const deleteCategoryButton = document.getElementById("delete-category-button");
const saveCategoryButton = document.getElementById("save-category-button");
const resetCategoryButton = document.getElementById("reset-category-button");
const viewLatestButton = document.getElementById("view-latest-button");
const editVersionButton = document.getElementById("edit-version-button");
const rollbackVersionButton = document.getElementById("rollback-version-button");
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

workflowCategoryInput.addEventListener("change", () => {
    state.draft.categoryId = workflowCategoryInput.value;
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
newWorkflowButton.addEventListener("click", () => {
    const draft = emptyWorkflow();
    draft.categoryId = state.selectedCategoryId ?? draft.categoryId;
    selectWorkflow(draft);
});
resetButton.addEventListener("click", () => {
    if (state.selectedWorkflowId) {
        void openWorkflow(state.selectedWorkflowId, state.selectedWorkflowVersion, { skipBusy: false });
        return;
    }

    selectWorkflow(null);
    setMessage("");
});
deleteButton.addEventListener("click", deleteCurrentWorkflow);
addCategoryButton.addEventListener("click", createCategory);
editCategoryButton.addEventListener("click", editSelectedCategory);
deleteCategoryButton.addEventListener("click", deleteSelectedCategory);
saveCategoryButton.addEventListener("click", () => saveCategory(state.categoryDraft, state.categoryDraft.originalCategoryId ?? null));
resetCategoryButton.addEventListener("click", resetCategoryDraft);
workflowVersionSelect.addEventListener("change", async () => {
    if (!state.selectedWorkflowId) {
        return;
    }

    const version = Number(workflowVersionSelect.value);
    if (!version) {
        return;
    }

    await openWorkflow(state.selectedWorkflowId, version);
});
viewLatestButton.addEventListener("click", async () => {
    if (!state.selectedWorkflowId) {
        return;
    }

    await openWorkflow(state.selectedWorkflowId);
});
editVersionButton.addEventListener("click", () => {
    if (!state.selectedWorkflowId || !getSelectedVersionInfo()) {
        return;
    }

    state.isEditingDetachedVersion = true;
    setMessage(`Editing ${state.draft.id} as a new version.`);
    renderDraft();
});
rollbackVersionButton.addEventListener("click", rollbackSelectedVersion);
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
        state.categories = await fetchJson("/workflow-categories");
        if (state.selectedCategoryId && !state.categories.some(category => category.id === state.selectedCategoryId)) {
            state.selectedCategoryId = null;
        }

        state.workflows = await fetchJson("/workflows");
        if (state.selectedWorkflowId && !state.workflows.some(workflow => workflow.id === state.selectedWorkflowId)) {
            state.selectedWorkflowId = null;
            state.selectedWorkflowVersion = null;
            state.versionHistory = [];
            state.isEditingDetachedVersion = false;
        }

        renderCategoryList();
        renderWorkflowList();
        if (state.selectedWorkflowId) {
            await openWorkflow(state.selectedWorkflowId, state.selectedWorkflowVersion, { skipBusy: true });
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
        if (isDraftReadOnly()) {
            throw new Error("This version is read-only. Choose Edit As New Version or roll back first.");
        }

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
        const savedWorkflow = await fetchJson("/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow, expectedVersion })
        });

        persistLayout(workflow.id);
        state.selectedWorkflowId = savedWorkflow.id;
        state.selectedWorkflowVersion = savedWorkflow.version ?? null;
        state.isEditingDetachedVersion = false;
        await loadWorkflows();
        setMessage(`Workflow '${savedWorkflow.id}' saved as v${savedWorkflow.version}.`);
    } catch (error) {
        setMessage(`Save failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function openWorkflow(workflowId, version = null, options = {}) {
    const { skipBusy = false } = options;

    if (!skipBusy) {
        setBusy(true);
        setMessage("");
    }

    try {
        const versionHistory = await fetchJson(`/workflows/${encodeURIComponent(workflowId)}/versions`);
        const latestVersion = versionHistory.find(item => item.isLatest) ?? versionHistory[0] ?? null;
        const selectedVersion = version && versionHistory.some(item => item.version === version)
            ? versionHistory.find(item => item.version === version)
            : latestVersion;

        if (!selectedVersion) {
            throw new Error(`No persisted versions were found for workflow '${workflowId}'.`);
        }

        const workflow = selectedVersion.isLatest
            ? state.workflows.find(item => item.id === workflowId) ?? await fetchJson(`/workflows/${encodeURIComponent(workflowId)}`)
            : await fetchJson(`/workflows/${encodeURIComponent(workflowId)}/versions/${selectedVersion.version}`);

        selectWorkflow(workflow, {
            versionHistory,
            selectedWorkflowVersion: selectedVersion.version,
            isEditingDetachedVersion: false
        });
    } catch (error) {
        setMessage(`Failed to open workflow. ${error.message}`, true);
    } finally {
        if (!skipBusy) {
            setBusy(false);
        }
    }
}

async function rollbackSelectedVersion() {
    const versionInfo = getSelectedVersionInfo();
    if (!state.selectedWorkflowId || !versionInfo || !canRollbackSelectedVersion()) {
        return;
    }

    if (!window.confirm(`Rollback '${state.selectedWorkflowId}' to version ${versionInfo.version}? Newer versions will be deleted.`)) {
        return;
    }

    setBusy(true);
    setMessage("Rolling back workflow...");

    try {
        const result = await fetchJson(`/workflows/${encodeURIComponent(state.selectedWorkflowId)}/rollback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetVersion: versionInfo.version })
        });

        state.selectedWorkflowId = result.workflow.id;
        state.selectedWorkflowVersion = result.workflow.version;
        state.versionHistory = result.versions ?? [];
        state.isEditingDetachedVersion = false;
        await loadWorkflows();
        setMessage(`Workflow '${result.workflow.id}' rolled back to v${result.workflow.version}.`);
    } catch (error) {
        setMessage(`Rollback failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function createCategory() {
    state.categoryDraft = {
        id: uniqueCategoryId(),
        name: "",
        description: "",
        originalCategoryId: null
    };
    renderCategoryEditor();
    categoryIdInput.focus();
}

async function editSelectedCategory() {
    const category = getSelectedCategory();
    if (!category) {
        return;
    }

    state.categoryDraft = {
        id: category.id,
        name: category.name,
        description: category.description ?? "",
        originalCategoryId: category.id
    };
    renderCategoryEditor();
    categoryNameInput.focus();
}

async function saveCategory(category, originalCategoryId = null) {
    const normalizedCategory = {
        id: slugifyIdentifier(categoryIdInput.value || category.id),
        name: categoryNameInput.value.trim() || category.name?.trim() || "",
        description: categoryDescriptionInput.value.trim() || category.description?.trim() || ""
    };

    if (!normalizedCategory.id) {
        setMessage("Category ID is required.", true);
        categoryIdInput.focus();
        return;
    }

    if (!normalizedCategory.name) {
        setMessage("Category name is required.", true);
        categoryNameInput.focus();
        return;
    }

    setBusy(true);
    setMessage("Saving category...");

    try {
        const savedCategory = await fetchJson("/workflow-categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                category: {
                    id: normalizedCategory.id,
                    name: normalizedCategory.name,
                    description: normalizedCategory.description,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                originalCategoryId
            })
        });

        if (originalCategoryId && state.draft.categoryId === originalCategoryId) {
            state.draft.categoryId = savedCategory.id;
        }

        state.selectedCategoryId = savedCategory.id;
        state.categoryDraft = {
            id: savedCategory.id,
            name: savedCategory.name,
            description: savedCategory.description ?? "",
            originalCategoryId: savedCategory.id
        };
        await loadWorkflows();
        setMessage(`Category '${savedCategory.name}' saved.`);
    } catch (error) {
        setMessage(`Category save failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

async function deleteSelectedCategory() {
    const category = getSelectedCategory();
    if (!category) {
        return;
    }

    if (!window.confirm(`Delete category '${category.name}'?`)) {
        return;
    }

    setBusy(true);
    setMessage("Deleting category...");

    try {
        const response = await fetch(`/workflow-categories/${encodeURIComponent(category.id)}`, {
            method: "DELETE",
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache"
            }
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || `/workflow-categories/${category.id} returned ${response.status}`);
        }

        if (state.draft.categoryId === category.id) {
            state.draft.categoryId = "general";
        }

        state.selectedCategoryId = "general";
        await loadWorkflows();
        setMessage(`Category '${category.name}' deleted.`);
    } catch (error) {
        setMessage(`Category delete failed. ${error.message}`, true);
    } finally {
        setBusy(false);
    }
}

function resetCategoryDraft() {
    const selectedCategory = getSelectedCategory();
    state.categoryDraft = selectedCategory
        ? {
            id: selectedCategory.id,
            name: selectedCategory.name,
            description: selectedCategory.description ?? "",
            originalCategoryId: selectedCategory.id
        }
        : emptyCategory();
    renderCategoryEditor();
}

async function deleteCurrentWorkflow() {
    const workflow = getSelectedWorkflow();
    if (!workflow) {
        return;
    }

    await deleteWorkflowById(workflow.id);
}

async function deleteWorkflowById(workflowId) {
    const workflow = state.workflows.find(item => item.id === workflowId);
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
            method: "DELETE",
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache"
            }
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

function selectWorkflow(workflow, options = {}) {
    const normalized = normalizeWorkflow(workflow ?? emptyWorkflow());
    state.selectedWorkflowId = workflow?.id ?? null;
    state.selectedWorkflowVersion = options.selectedWorkflowVersion ?? workflow?.version ?? null;
    state.versionHistory = options.versionHistory ?? (workflow ? state.versionHistory : []);
    state.isEditingDetachedVersion = options.isEditingDetachedVersion ?? false;
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
    renderCategoryOptions();
    workflowNameInput.value = state.draft.name ?? "";
    workflowDescriptionInput.value = state.draft.description ?? "";
    renderInitialStatusOptions();
    renderWorkflowHeader();
    renderVersionHistory();
    applyEditorLockState();
}

function renderDraft() {
    renderWorkflowHeader();
    renderCategoryOptions();
    renderInitialStatusOptions();
    renderVersionHistory();
    renderSummary();
    renderCanvas();
    renderInspector();
    renderJsonPreview();
    applyEditorLockState();
}

function renderDerivedState(options = {}) {
    renderWorkflowHeader();
    renderCategoryOptions();
    renderInitialStatusOptions();
    renderVersionHistory();
    renderSummary();
    renderCanvas();
    renderJsonPreview();
    applyEditorLockState();

    if (options.includeWorkflowList) {
        renderWorkflowList();
    }
}

function renderWorkflowHeader() {
    const isSaved = !!getSelectedWorkflow();
    const workflowName = state.draft.name || "Untitled workflow";
    const versionSuffix = state.selectedWorkflowVersion ? ` v${state.selectedWorkflowVersion}` : "";
    editorTitle.textContent = isSaved
        ? `${state.isEditingDetachedVersion ? "Edit new revision of" : "Edit"} ${workflowName}${versionSuffix}`
        : "Create workflow";
}

function renderCategoryOptions() {
    const categories = state.categories ?? [];

    if (!categories.length) {
        workflowCategoryInput.innerHTML = '<option value="">No categories</option>';
        workflowCategoryInput.disabled = true;
        state.draft.categoryId = "";
        return;
    }

    workflowCategoryInput.innerHTML = categories.map(category => `
        <option value="${escapeHtml(category.id)}" ${category.id === state.draft.categoryId ? "selected" : ""}>
            ${escapeHtml(category.name)}
        </option>
    `).join("");

    workflowCategoryInput.disabled = false;
    if (!categories.some(category => category.id === state.draft.categoryId)) {
        state.draft.categoryId = categories[0].id;
    }

    workflowCategoryInput.value = state.draft.categoryId;
}

function renderCategoryList() {
    addCategoryButton.disabled = state.isBusy;
    renderCategoryEditor();

    const allCard = `
        <article class="workflow-card ${state.selectedCategoryId === null ? "selected" : ""}" data-category-id="">
            <div class="workflow-card-header">
                <div>
                    <h3 class="workflow-card-title">All Categories</h3>
                    <p class="workflow-meta">catalog</p>
                </div>
                <div class="workflow-card-actions">
                    <span class="pill">${escapeHtml(String(state.workflows.length))} workflows</span>
                </div>
            </div>
        </article>
    `;

    if (!state.categories.length) {
        categoryList.innerHTML = `${allCard}${createEmptyCategoryCardHtml()}`;
        editCategoryButton.disabled = true;
        deleteCategoryButton.disabled = true;
        bindCategoryCards();
        return;
    }

    categoryList.innerHTML = `${allCard}${state.categories.map(category => `
        <article class="workflow-card ${category.id === state.selectedCategoryId ? "selected" : ""}" data-category-id="${escapeHtml(category.id)}">
            <div class="workflow-card-header">
                <div>
                    <h3 class="workflow-card-title">${escapeHtml(category.name)}</h3>
                    <p class="workflow-meta">${escapeHtml(category.id)}</p>
                </div>
                <div class="workflow-card-actions">
                    ${category.id === "general" ? '<span class="pill">Default</span>' : ""}
                </div>
            </div>
            <div class="status-badges">
                <span class="pill">${escapeHtml(String(countWorkflowsForCategory(category.id)))} workflows</span>
            </div>
        </article>
    `).join("")}`;

    bindCategoryCards();

    editCategoryButton.disabled = state.isBusy || !getSelectedCategory();
    deleteCategoryButton.disabled = state.isBusy || !getSelectedCategory() || state.selectedCategoryId === "general";
}

function bindCategoryCards() {
    for (const card of categoryList.querySelectorAll("[data-category-id]")) {
        card.addEventListener("click", () => {
            const categoryId = card.dataset.categoryId || null;
            state.selectedCategoryId = categoryId;
            resetCategoryDraft();
            renderCategoryList();
            renderWorkflowList();
        });
    }
}

function createEmptyCategoryCardHtml() {
    return `
        <div class="empty-state">
            <p class="empty-title">No categories</p>
            <p class="empty-copy">Add a workflow category to start organizing definitions.</p>
        </div>
    `;
}

function renderCategoryEditor() {
    categoryIdInput.value = state.categoryDraft.id ?? "";
    categoryNameInput.value = state.categoryDraft.name ?? "";
    categoryDescriptionInput.value = state.categoryDraft.description ?? "";
    categoryIdInput.readOnly = state.isBusy;
    categoryNameInput.readOnly = state.isBusy;
    categoryDescriptionInput.readOnly = state.isBusy;
    saveCategoryButton.disabled = state.isBusy;
    resetCategoryButton.disabled = state.isBusy;
}

function renderVersionHistory() {
    if (!state.selectedWorkflowId || !state.versionHistory.length) {
        workflowVersionSelect.innerHTML = '<option value="">Unsaved draft</option>';
        workflowVersionSelect.disabled = true;
        workflowVersionSummary.innerHTML = '<span class="pill">No persisted revisions yet</span>';
        viewLatestButton.disabled = true;
        editVersionButton.disabled = true;
        rollbackVersionButton.disabled = true;
        return;
    }

    workflowVersionSelect.disabled = state.isBusy;
    workflowVersionSelect.innerHTML = state.versionHistory.map(version => `
        <option value="${escapeHtml(String(version.version))}" ${version.version === state.selectedWorkflowVersion ? "selected" : ""}>
            v${escapeHtml(String(version.version))}${version.isLatest ? " latest" : ""}${version.instanceCount ? ` - ${version.instanceCount} instance${version.instanceCount === 1 ? "" : "s"}` : ""}
        </option>
    `).join("");

    const selectedVersion = getSelectedVersionInfo();
    const latestVersion = getLatestVersionInfo();
    const summaryPills = [];

    summaryPills.push(`<span class="pill">Selected v${escapeHtml(String(selectedVersion?.version ?? latestVersion?.version ?? ""))}</span>`);
    if (selectedVersion?.isLatest) {
        summaryPills.push('<span class="pill">Latest</span>');
    } else {
        summaryPills.push('<span class="pill">Archive</span>');
    }

    if (selectedVersion?.instanceCount) {
        summaryPills.push(`<span class="pill">${escapeHtml(String(selectedVersion.instanceCount))} instances</span>`);
    } else {
        summaryPills.push('<span class="pill">No instances</span>');
    }

    if (isDraftReadOnly()) {
        summaryPills.push('<span class="pill">Read only</span>');
    } else if (state.isEditingDetachedVersion) {
        summaryPills.push('<span class="pill">Editing as new</span>');
    } else {
        summaryPills.push('<span class="pill">Editable</span>');
    }

    workflowVersionSummary.innerHTML = summaryPills.join("");
    viewLatestButton.disabled = state.isBusy || !selectedVersion || selectedVersion.isLatest;
    editVersionButton.disabled = state.isBusy || !selectedVersion;
    rollbackVersionButton.disabled = state.isBusy || !canRollbackSelectedVersion();
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
        if (state.selectedCategoryId && workflow.categoryId !== state.selectedCategoryId) {
            return false;
        }

        if (!state.filter) {
            return true;
        }

        return workflow.id.toLowerCase().includes(state.filter)
            || workflow.name.toLowerCase().includes(state.filter);
    });

    if (!filtered.length) {
        workflowList.replaceChildren(createEmptyState(
            "No workflows match",
            state.filter
                ? "Try a different search term."
                : state.selectedCategoryId
                    ? "No workflows are assigned to this category yet."
                    : "Create your first workflow to get started."
        ));
        return;
    }

    workflowList.innerHTML = filtered.map(workflow => {
        const statuses = workflow.statuses ?? [];
        const actionCount = statuses.reduce((count, status) => count + (status.actions ?? []).length, 0);
        const category = getCategoryById(workflow.categoryId);

        return `
            <article class="workflow-card ${workflow.id === state.selectedWorkflowId ? "selected" : ""}" data-workflow-id="${escapeHtml(workflow.id)}">
                <div class="workflow-card-header">
                    <div>
                        <h3 class="workflow-card-title">${escapeHtml(workflow.name)}</h3>
                        <p class="workflow-meta">${escapeHtml(workflow.id)}${category ? ` / ${escapeHtml(category.name)}` : ""}</p>
                    </div>
                    <div class="workflow-card-actions">
                        <span class="pill">v${escapeHtml(String(workflow.version ?? 0))}</span>
                        <button
                            class="danger-button workflow-delete-button"
                            type="button"
                            data-delete-workflow-id="${escapeHtml(workflow.id)}"
                            aria-label="Delete workflow ${escapeHtml(workflow.id)}">
                            Delete
                        </button>
                    </div>
                </div>
                <div class="status-badges">
                    ${category ? `<span class="pill">${escapeHtml(category.name)}</span>` : ""}
                    <span class="pill">${statuses.length} statuses</span>
                    <span class="pill">${actionCount} actions</span>
                </div>
            </article>
        `;
    }).join("");

    for (const card of workflowList.querySelectorAll("[data-workflow-id]")) {
        card.addEventListener("click", async () => {
            if (!card.dataset.workflowId) {
                return;
            }

            await openWorkflow(card.dataset.workflowId);
        });
    }

    for (const button of workflowList.querySelectorAll("[data-delete-workflow-id]")) {
        button.addEventListener("click", async event => {
            event.stopPropagation();
            await deleteWorkflowById(button.dataset.deleteWorkflowId);
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
                action.mode = normalizeActionModeValue(target.value);
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
        categoryId: state.draft.categoryId,
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
                mode: normalizeActionModeValue(action.mode),
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
    state.draft.categoryId = workflowCategoryInput.value || state.draft.categoryId;
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
                action.mode = normalizeActionModeValue(fieldElement.value);
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

    if (!workflow.categoryId) {
        throw new Error("Workflow category is required.");
    }

    if (!state.categories.some(category => category.id === workflow.categoryId)) {
        throw new Error(`Workflow category '${workflow.categoryId}' does not exist.`);
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
    if (expected.categoryId !== actual.categoryId) mismatches.push("categoryId");
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
        categoryId: normalized.categoryId || "general",
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
        categoryId: workflow.categoryId || state.categories[0]?.id || "general",
        name: workflow.name ?? "",
        description: workflow.description ?? "",
        initialStatus: workflow.initialStatus ?? workflow.statuses?.[0]?.code ?? "",
        statuses: (workflow.statuses ?? []).map(status => ({
            code: status.code ?? "",
            name: status.name ?? status.code ?? "",
            description: status.description ?? "",
            isTerminal: readTerminalFlag(status),
            actions: (status.actions ?? []).map(action => ({
                code: action.code ?? "",
                name: action.name ?? action.code ?? "",
                description: action.description ?? "",
                targetStatus: action.targetStatus ?? "",
                mode: normalizeActionModeValue(readActionMode(action)),
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
        categoryId: state.categories[0]?.id ?? "general",
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

function emptyCategory() {
    return {
        id: "",
        name: "",
        description: "",
        originalCategoryId: null
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

function getSelectedCategory() {
    return state.categories.find(category => category.id === state.selectedCategoryId) ?? null;
}

function getCategoryById(categoryId) {
    return state.categories.find(category => category.id === categoryId) ?? null;
}

function countWorkflowsForCategory(categoryId) {
    return state.workflows.filter(workflow => workflow.categoryId === categoryId).length;
}

function getLatestVersionInfo() {
    return state.versionHistory.find(version => version.isLatest) ?? state.versionHistory[0] ?? null;
}

function getSelectedVersionInfo() {
    return state.versionHistory.find(version => version.version === state.selectedWorkflowVersion) ?? getLatestVersionInfo();
}

function isDraftReadOnly() {
    const versionInfo = getSelectedVersionInfo();
    if (!state.selectedWorkflowId || !versionInfo) {
        return false;
    }

    if (state.isEditingDetachedVersion) {
        return false;
    }

    return !versionInfo.isLatest || versionInfo.instanceCount > 0;
}

function canRollbackSelectedVersion() {
    const selectedVersion = getSelectedVersionInfo();
    if (!selectedVersion || selectedVersion.isLatest) {
        return false;
    }

    return !state.versionHistory.some(version =>
        version.version > selectedVersion.version && version.instanceCount > 0);
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

function uniqueCategoryId() {
    const existing = new Set(state.categories.map(category => category.id));
    let index = state.categories.length + 1;
    let candidate = "category";

    while (existing.has(candidate)) {
        index += 1;
        candidate = `category_${index}`;
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
    const requestOptions = {
        cache: "no-store",
        ...options,
        headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            ...(options?.headers ?? {})
        }
    };

    const response = await fetch(url, requestOptions);
    const responseText = await response.text();
    if (!response.ok) {
        let detail = "";

        try {
            const errorPayload = responseText ? JSON.parse(responseText) : null;
            detail = errorPayload?.error ?? errorPayload?.message ?? "";
        } catch {
            detail = responseText.trim();
        }

        throw new Error(detail
            ? `${url} returned ${response.status}: ${detail}`
            : `${url} returned ${response.status}`);
    }

    if (response.status === 204 || !responseText) {
        return null;
    }

    return JSON.parse(responseText);
}

function setBusy(isBusy) {
    state.isBusy = isBusy;
    refreshButton.disabled = isBusy;
    newWorkflowButton.disabled = isBusy;
    applyEditorLockState();
    renderCategoryList();
    renderVersionHistory();
}

function applyEditorLockState() {
    const lockEditing = state.isBusy || isDraftReadOnly() || state.categories.length === 0;
    const excludedIds = new Set([
        "workflow-version-select",
        "view-latest-button",
        "edit-version-button",
        "rollback-version-button",
        "delete-button",
        "reset-button"
    ]);

    for (const element of workflowForm.querySelectorAll("input, textarea, select, button")) {
        if (excludedIds.has(element.id)) {
            continue;
        }

        if (element.tagName === "BUTTON" || element.tagName === "SELECT" || element.type === "checkbox" || element.type === "radio") {
            element.disabled = lockEditing;
            continue;
        }

        element.readOnly = lockEditing;
    }

    deleteButton.disabled = state.isBusy || !getSelectedWorkflow();
    resetButton.disabled = state.isBusy;
    addStatusButton.disabled = lockEditing;
    connectButton.disabled = lockEditing;
    autoLayoutButton.disabled = lockEditing;
}

function setMessage(message, isError = false) {
    formMessage.textContent = message;
    formMessage.className = `message-banner${message ? isError ? " error" : " success" : ""}`;
}

function readTerminalFlag(status) {
    if (typeof status?.isTerminal === "boolean") {
        return status.isTerminal;
    }

    const actions = Array.isArray(status?.actions) ? status.actions : [];
    return actions.length === 0;
}

function readActionMode(action) {
    if (typeof action?.mode === "string" && action.mode) {
        return action.mode;
    }

    return action?.isStraightThroughProcessing ? "Automatic" : "Manual";
}

function normalizeActionModeValue(value) {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "automatic") {
            return "Automatic";
        }

        if (normalized === "manual") {
            return "Manual";
        }
    }

    return value === true ? "Automatic" : "Manual";
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
