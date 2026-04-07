const blotterStore = window.SquiddyTradeStore;
const blotterState = {
    search: "",
    assetClass: "",
    tradeType: "",
    book: "",
    statuses: new Set(),
    selectedTicketId: null
};

const blotterUiBuildPill = document.getElementById("blotter-ui-build-pill");
const blotterRefreshButton = document.getElementById("blotter-refresh-button");
const blotterSearchInput = document.getElementById("blotter-search");
const blotterAssetClassInput = document.getElementById("blotter-asset-class");
const blotterTradeTypeInput = document.getElementById("blotter-trade-type");
const blotterBookInput = document.getElementById("blotter-book");
const statusFilterList = document.getElementById("status-filter-list");
const laneSummaryList = document.getElementById("lane-summary-list");
const blotterCountPill = document.getElementById("blotter-count-pill");
const grossNotionalStat = document.getElementById("gross-notional-stat");
const readyCountStat = document.getElementById("ready-count-stat");
const exceptionCountStat = document.getElementById("exception-count-stat");
const tradeTypeStat = document.getElementById("trade-type-stat");
const blotterTableBody = document.getElementById("blotter-table-body");
const selectedTradeDetail = document.getElementById("selected-trade-detail");
const selectedTradeActivity = document.getElementById("selected-trade-activity");

const availableStatuses = ["Captured", "Validated", "Pending Approval", "Approved", "Booked", "Rejected"];

blotterUiBuildPill.textContent = "UI 2026-03-27.2";
blotterStore.seedIfEmpty();

blotterSearchInput.addEventListener("input", () => {
    blotterState.search = blotterSearchInput.value.trim().toLowerCase();
    renderBlotter();
});

blotterAssetClassInput.addEventListener("change", () => {
    blotterState.assetClass = blotterAssetClassInput.value;
    renderBlotter();
});

blotterTradeTypeInput.addEventListener("change", () => {
    blotterState.tradeType = blotterTradeTypeInput.value;
    renderBlotter();
});

blotterBookInput.addEventListener("input", () => {
    blotterState.book = blotterBookInput.value.trim().toLowerCase();
    renderBlotter();
});

blotterRefreshButton.addEventListener("click", renderBlotter);

statusFilterList.addEventListener("click", event => {
    const button = event.target.closest("[data-status-filter]");
    if (!button) {
        return;
    }

    const status = button.dataset.statusFilter;
    if (blotterState.statuses.has(status)) {
        blotterState.statuses.delete(status);
    }
    else {
        blotterState.statuses.add(status);
    }

    renderBlotter();
});

blotterTableBody.addEventListener("click", event => {
    const openButton = event.target.closest("[data-open-ticket]");
    if (openButton) {
        window.location.href = `/dashboard/trade-ticket.html?ticketId=${encodeURIComponent(openButton.dataset.openTicket)}`;
        return;
    }

    const row = event.target.closest("[data-select-ticket]");
    if (!row) {
        return;
    }

    blotterState.selectedTicketId = row.dataset.selectTicket;
    renderBlotter();
});

function renderBlotter() {
    const trades = blotterStore.listTrades();
    const filtered = trades.filter(matchesFilters);
    const selected = resolveSelectedTrade(filtered, trades);

    renderStatusFilters();
    renderLaneSummary(filtered);
    renderStats(filtered);
    renderRows(filtered, selected?.ticketId ?? null);
    renderSelectedTrade(selected);
}

function renderStatusFilters() {
    statusFilterList.innerHTML = availableStatuses
        .map(status => `
            <button
                class="filter-chip ${blotterState.statuses.has(status) ? "is-selected" : ""}"
                type="button"
                data-status-filter="${escapeHtml(status)}">
                ${escapeHtml(status)}
            </button>
        `)
        .join("");
}

function renderLaneSummary(trades) {
    const lanes = [
        { label: "Ready for booking", count: trades.filter(trade => trade.status === "Approved").length },
        { label: "Exceptions", count: trades.filter(trade => trade.exceptionState === "Escalated" || !trade.counterparty || !trade.book).length },
        { label: "Booked", count: trades.filter(trade => trade.status === "Booked").length }
    ];

    laneSummaryList.innerHTML = lanes
        .map(item => `
            <article class="lane-summary-card">
                <p class="field-label">${escapeHtml(item.label)}</p>
                <strong class="stat-value">${item.count}</strong>
            </article>
        `)
        .join("");
}

function renderStats(trades) {
    const gross = trades.reduce((sum, trade) => sum + (Number(trade.quantity) || 0) * (Number(trade.price) || 0), 0);
    const ready = trades.filter(trade => trade.status === "Approved").length;
    const exceptions = trades.filter(trade => trade.exceptionState === "Escalated" || !trade.counterparty || !trade.book).length;
    const tradeTypes = new Set(trades.map(trade => trade.tradeType).filter(Boolean));

    blotterCountPill.textContent = `${trades.length} trade${trades.length === 1 ? "" : "s"}`;
    grossNotionalStat.textContent = formatCurrency(gross, "USD");
    readyCountStat.textContent = String(ready);
    exceptionCountStat.textContent = String(exceptions);
    tradeTypeStat.textContent = String(tradeTypes.size);
}

function renderRows(trades, selectedTicketId) {
    if (trades.length === 0) {
        blotterTableBody.innerHTML = `
            <tr>
                <td colspan="13">${createEmptyState("No trades match the current filter", "Try widening the search or clearing one of the lane filters.")}</td>
            </tr>
        `;
        return;
    }

    blotterTableBody.innerHTML = trades
        .map(trade => {
            const gross = (Number(trade.quantity) || 0) * (Number(trade.price) || 0);
            return `
                <tr class="${trade.ticketId === selectedTicketId ? "is-selected" : ""}" data-select-ticket="${escapeHtml(trade.ticketId)}">
                    <td>
                        <div class="blotter-ticket-cell">
                            <strong>${escapeHtml(trade.ticketId)}</strong>
                            <span class="helper-copy">${escapeHtml(trade.tradeType)} / ${escapeHtml(trade.assetClass)} / ${escapeHtml(trade.productType)}</span>
                            ${trade.exceptionState === "Escalated" ? '<span class="pill pill-error">Escalated</span>' : ""}
                        </div>
                    </td>
                    <td><span class="pill trade-status-pill trade-status-${normalizeToken(trade.status)}">${escapeHtml(trade.status)}</span></td>
                    <td>${escapeHtml(trade.tradeType || "Cash")}</td>
                    <td>${escapeHtml(trade.instrument || "Unassigned")}</td>
                    <td>${escapeHtml(trade.side)}</td>
                    <td>${formatNumber(trade.quantity)}</td>
                    <td>${formatCurrency(trade.price, trade.currency || "USD")}</td>
                    <td>${formatCurrency(gross, trade.currency || "USD")}</td>
                    <td>${escapeHtml(trade.book || "Missing")}</td>
                    <td>${escapeHtml(trade.trader || "Unassigned")}</td>
                    <td>${escapeHtml(trade.counterparty || "Missing")}</td>
                    <td>${escapeHtml(formatTimestamp(trade.updatedAt))}</td>
                    <td><button class="ghost-button blotter-open-button" type="button" data-open-ticket="${escapeHtml(trade.ticketId)}">Open</button></td>
                </tr>
            `;
        })
        .join("");
}

function renderSelectedTrade(trade) {
    if (!trade) {
        selectedTradeDetail.innerHTML = createEmptyState("No trade selected", "Select a row in the blotter to inspect it here.");
        selectedTradeActivity.innerHTML = "";
        return;
    }

    const gross = (Number(trade.quantity) || 0) * (Number(trade.price) || 0);
    selectedTradeDetail.innerHTML = `
        <div class="selected-trade-grid">
            <div>
                <p class="field-label">Ticket</p>
                <h3>${escapeHtml(trade.ticketId)}</h3>
            </div>
            <div class="toolbar">
                <span class="pill trade-status-pill trade-status-${normalizeToken(trade.status)}">${escapeHtml(trade.status)}</span>
                ${trade.exceptionState === "Escalated" ? '<span class="pill pill-error">Escalated</span>' : ""}
                <a class="ghost-button blotter-inline-link" href="/dashboard/trade-ticket.html?ticketId=${encodeURIComponent(trade.ticketId)}">Open Ticket</a>
            </div>
            <article class="detail-card">
                <p class="field-label">Classification</p>
                <p>${escapeHtml(trade.tradeType || "Cash")} / ${escapeHtml(trade.assetClass)} / ${escapeHtml(trade.productType)}</p>
                <p class="helper-copy">${escapeHtml(trade.instrument || "Instrument missing")}</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Economics</p>
                <p>${escapeHtml(trade.side)} ${escapeHtml(trade.instrument)} at ${formatCurrency(trade.price, trade.currency || "USD")} for ${formatNumber(trade.quantity)}</p>
                <p class="helper-copy">${formatCurrency(gross, trade.currency || "USD")} gross notional</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Booking</p>
                <p>${escapeHtml(trade.book || "Missing")} / ${escapeHtml(trade.strategy || "No strategy")}</p>
                <p class="helper-copy">${escapeHtml(trade.trader || "No trader")} facing ${escapeHtml(trade.counterparty || "No counterparty")}</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Settlement</p>
                <p>${escapeHtml(trade.settlementInstruction || "Instruction missing")}</p>
                <p class="helper-copy">${escapeHtml(trade.settlementLocation || "Location missing")} / ${escapeHtml(trade.cashAccount || "Cash account missing")}</p>
            </article>
        </div>
    `;

    selectedTradeActivity.innerHTML = trade.activity
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

function resolveSelectedTrade(filtered, allTrades) {
    if (blotterState.selectedTicketId) {
        const selected = filtered.find(trade => trade.ticketId === blotterState.selectedTicketId)
            ?? allTrades.find(trade => trade.ticketId === blotterState.selectedTicketId);
        if (selected) {
            return selected;
        }
    }

    const first = filtered[0] ?? allTrades[0] ?? null;
    blotterState.selectedTicketId = first?.ticketId ?? null;
    return first;
}

function matchesFilters(trade) {
    const haystack = [
        trade.ticketId,
        trade.instrument,
        trade.trader,
        trade.counterparty,
        trade.book,
        trade.productType,
        trade.tradeType
    ].join(" ").toLowerCase();

    if (blotterState.search && !haystack.includes(blotterState.search)) {
        return false;
    }

    if (blotterState.assetClass && trade.assetClass !== blotterState.assetClass) {
        return false;
    }

    if (blotterState.tradeType && trade.tradeType !== blotterState.tradeType) {
        return false;
    }

    if (blotterState.book && !String(trade.book || "").toLowerCase().includes(blotterState.book)) {
        return false;
    }

    if (blotterState.statuses.size > 0 && !blotterState.statuses.has(trade.status)) {
        return false;
    }

    return true;
}

function formatCurrency(value, currency) {
    const code = String(currency || "USD").trim().toUpperCase();
    const amount = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);

    return `${code} ${amount}`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 4
    }).format(Number(value) || 0);
}

function formatTimestamp(value) {
    if (!value) {
        return "Unknown";
    }

    return String(value).replace("T", " ").slice(0, 16);
}

function normalizeToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
}

function createEmptyState(title, copy) {
    const template = document.getElementById("blotter-empty-state-template");
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

renderBlotter();
