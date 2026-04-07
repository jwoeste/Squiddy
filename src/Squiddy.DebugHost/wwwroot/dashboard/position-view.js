const positionStore = window.SquiddyTradeStore;
const POSITION_STATUSES = ["Captured", "Validated", "Pending Approval", "Approved", "Booked", "Rejected"];

const positionState = {
    search: "",
    groupBy: "portfolio",
    assetClass: "",
    tradeType: "",
    trader: "",
    portfolio: "",
    counterparty: "",
    product: "",
    book: "",
    instrument: "",
    statuses: new Set(POSITION_STATUSES),
    selectedGroupKey: null
};

const positionUiBuildPill = document.getElementById("position-ui-build-pill");
const positionRefreshButton = document.getElementById("position-refresh-button");
const positionSearchInput = document.getElementById("position-search");
const positionGroupByInput = document.getElementById("position-group-by");
const positionAssetClassInput = document.getElementById("position-asset-class");
const positionTradeTypeFilterInput = document.getElementById("position-trade-type-filter");
const positionTraderFilterInput = document.getElementById("position-trader-filter");
const positionPortfolioFilterInput = document.getElementById("position-portfolio-filter");
const positionCounterpartyFilterInput = document.getElementById("position-counterparty-filter");
const positionProductFilterInput = document.getElementById("position-product-filter");
const positionBookFilterInput = document.getElementById("position-book-filter");
const positionInstrumentFilterInput = document.getElementById("position-instrument-filter");
const positionStatusFilterList = document.getElementById("position-status-filter-list");
const positionCoverageList = document.getElementById("position-coverage-list");
const positionCountPill = document.getElementById("position-count-pill");
const positionNetStat = document.getElementById("position-net-stat");
const positionGrossStat = document.getElementById("position-gross-stat");
const positionQuantityStat = document.getElementById("position-quantity-stat");
const positionGroupsStat = document.getElementById("position-groups-stat");
const positionCurrencyChart = document.getElementById("position-chart-currency");
const positionTradeTypeChart = document.getElementById("position-chart-trade-type");
const positionCounterpartyChart = document.getElementById("position-chart-counterparty");
const positionStatusChart = document.getElementById("position-chart-status");
const positionTableBody = document.getElementById("position-table-body");
const positionSelectedDetail = document.getElementById("position-selected-detail");
const positionConstituentsBody = document.getElementById("position-constituents-body");
const PIE_CHART_COLORS = ["#ff8c00", "#43d7ff", "#7cff6b", "#ffd24a", "#ff5a36", "#ae7bff", "#4df0b7", "#f68fca"];

positionUiBuildPill.textContent = "UI 2026-04-07.1";
positionStore.seedIfEmpty();

bindFilter(positionSearchInput, value => positionState.search = value.trim().toLowerCase());
bindFilter(positionGroupByInput, value => positionState.groupBy = value);
bindFilter(positionAssetClassInput, value => positionState.assetClass = value);
bindFilter(positionTradeTypeFilterInput, value => positionState.tradeType = value);
bindFilter(positionTraderFilterInput, value => positionState.trader = value.trim().toLowerCase());
bindFilter(positionPortfolioFilterInput, value => positionState.portfolio = value.trim().toLowerCase());
bindFilter(positionCounterpartyFilterInput, value => positionState.counterparty = value.trim().toLowerCase());
bindFilter(positionProductFilterInput, value => positionState.product = value.trim().toLowerCase());
bindFilter(positionBookFilterInput, value => positionState.book = value.trim().toLowerCase());
bindFilter(positionInstrumentFilterInput, value => positionState.instrument = value.trim().toLowerCase());

positionRefreshButton.addEventListener("click", renderPositions);

positionStatusFilterList.addEventListener("click", event => {
    const button = event.target.closest("[data-position-status]");
    if (!button) {
        return;
    }

    const status = button.dataset.positionStatus;
    if (positionState.statuses.has(status)) {
        positionState.statuses.delete(status);
    }
    else {
        positionState.statuses.add(status);
    }

    renderPositions();
});

positionTableBody.addEventListener("click", event => {
    const row = event.target.closest("[data-position-group]");
    if (!row) {
        return;
    }

    positionState.selectedGroupKey = row.dataset.positionGroup;
    renderPositions();
});

function bindFilter(element, setter) {
    element.addEventListener("input", () => {
        setter(element.value);
        renderPositions();
    });

    element.addEventListener("change", () => {
        setter(element.value);
        renderPositions();
    });
}

function renderPositions() {
    const rows = positionStore.listPositionRows();
    const filteredRows = rows.filter(matchesPositionFilters);
    const groups = aggregateGroups(filteredRows, positionState.groupBy);
    const selectedGroup = resolveSelectedGroup(groups);

    renderStatusFilters();
    renderCoverage(filteredRows);
    renderStats(filteredRows, groups);
    renderCharts(filteredRows);
    renderGroupTable(groups, selectedGroup?.key ?? null);
    renderSelectedGroup(selectedGroup);
}

function renderStatusFilters() {
    positionStatusFilterList.innerHTML = POSITION_STATUSES
        .map(status => `
            <button
                class="filter-chip ${positionState.statuses.has(status) ? "is-selected" : ""}"
                type="button"
                data-position-status="${escapeHtml(status)}">
                ${escapeHtml(status)}
            </button>
        `)
        .join("");
}

function renderCoverage(rows) {
    const cards = [
        { label: "Traders", value: uniqueCount(rows, "trader") },
        { label: "Portfolios", value: uniqueCount(rows, "portfolio") },
        { label: "Counterparties", value: uniqueCount(rows, "counterparty") },
        { label: "Trade types", value: uniqueCount(rows, "tradeType") }
    ];

    positionCoverageList.innerHTML = cards
        .map(card => `
            <article class="lane-summary-card">
                <p class="field-label">${escapeHtml(card.label)}</p>
                <strong class="stat-value">${card.value}</strong>
            </article>
        `)
        .join("");
}

function renderStats(rows, groups) {
    const netMarketValue = rows.reduce((sum, row) => sum + row.netMarketValue, 0);
    const grossNotional = rows.reduce((sum, row) => sum + row.grossNotional, 0);
    const netQuantity = rows.reduce((sum, row) => sum + row.signedQuantity, 0);

    positionCountPill.textContent = `${rows.length} position row${rows.length === 1 ? "" : "s"}`;
    positionNetStat.textContent = formatCurrency(netMarketValue, "USD");
    positionGrossStat.textContent = formatCurrency(grossNotional, "USD");
    positionQuantityStat.textContent = formatNumber(netQuantity);
    positionGroupsStat.textContent = String(groups.length);
}

function renderCharts(rows) {
    const chartDefinitions = [
        {
            element: positionCurrencyChart,
            title: "By Currency",
            copy: "Distribution of the filtered position rows by trade currency.",
            model: buildPieChartModel(rows, row => row.currency || "USD", {
                sort: (left, right) => left.label.localeCompare(right.label)
            })
        },
        {
            element: positionTradeTypeChart,
            title: "By Trade Type",
            copy: "Cash, position, and contract / OTC composition of the current slice.",
            model: buildPieChartModel(rows, row => row.tradeType || "Cash", {
                order: ["Cash", "Position", "Contract / OTC"]
            })
        },
        {
            element: positionCounterpartyChart,
            title: "By Counterparty",
            copy: "Largest counterparties in the filtered position set, with long tails rolled into Other.",
            model: buildPieChartModel(rows, row => row.counterparty || "Unassigned", {
                limit: 5
            })
        },
        {
            element: positionStatusChart,
            title: "By Trade Status",
            copy: "Workflow-state distribution of the rows contributing to the current view.",
            model: buildPieChartModel(rows, row => row.status || "Captured", {
                order: POSITION_STATUSES
            })
        }
    ];

    for (const chart of chartDefinitions) {
        renderPieChartCard(chart.element, chart.title, chart.copy, chart.model);
    }
}

function renderGroupTable(groups, selectedKey) {
    if (groups.length === 0) {
        positionTableBody.innerHTML = `
            <tr>
                <td colspan="9">${createEmptyState("No positions match the current slice", "Try widening the filter set or enabling more workflow statuses.")}</td>
            </tr>
        `;
        return;
    }

    positionTableBody.innerHTML = groups
        .map(group => `
            <tr class="${group.key === selectedKey ? "is-selected" : ""}" data-position-group="${escapeHtml(group.key)}">
                <td>
                    <div class="blotter-ticket-cell">
                        <strong>${escapeHtml(group.label)}</strong>
                        <span class="helper-copy">${escapeHtml(group.dimensionLabel)}</span>
                    </div>
                </td>
                <td>${group.rowCount}</td>
                <td>${formatNumber(group.netQuantity)}</td>
                <td>${formatNumber(group.grossQuantity)}</td>
                <td>${formatCurrency(group.netMarketValue, "USD")}</td>
                <td>${formatCurrency(group.grossNotional, "USD")}</td>
                <td>${group.bookCount}</td>
                <td>${group.counterpartyCount}</td>
                <td>${group.instrumentCount}</td>
            </tr>
        `)
        .join("");
}

function renderSelectedGroup(group) {
    if (!group) {
        positionSelectedDetail.innerHTML = createEmptyState("No slice selected", "Choose an aggregate row to inspect the underlying positions.");
        positionConstituentsBody.innerHTML = "";
        return;
    }

    positionSelectedDetail.innerHTML = `
        <div class="selected-trade-grid">
            <div>
                <p class="field-label">Slice</p>
                <h3>${escapeHtml(group.label)}</h3>
            </div>
            <div class="toolbar">
                <span class="pill">${escapeHtml(group.dimensionLabel)}</span>
                <span class="pill">${group.rowCount} rows</span>
            </div>
            <article class="detail-card">
                <p class="field-label">Classification</p>
                <p>${group.tradeTypeCount} trade types / ${group.productCount} products</p>
                <p class="helper-copy">${group.counterpartyCount} counterparties across ${group.instrumentCount} instruments</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Net market value</p>
                <p>${formatCurrency(group.netMarketValue, "USD")}</p>
                <p class="helper-copy">${formatCurrency(group.grossNotional, "USD")} gross notional</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Net quantity</p>
                <p>${formatNumber(group.netQuantity)}</p>
                <p class="helper-copy">${formatNumber(group.grossQuantity)} gross quantity</p>
            </article>
            <article class="detail-card">
                <p class="field-label">Coverage</p>
                <p>${group.traderCount} traders / ${group.portfolioCount} portfolios / ${group.bookCount} books</p>
                <p class="helper-copy">${group.assetClassCount} asset classes represented in this slice</p>
            </article>
        </div>
    `;

    positionConstituentsBody.innerHTML = group.rows
        .map(row => `
            <tr>
                <td><a class="ghost-button blotter-inline-link" href="/dashboard/trade-ticket.html?ticketId=${encodeURIComponent(row.ticketId)}">${escapeHtml(row.ticketId)}</a></td>
                <td>${escapeHtml(row.instrument || "Unassigned")}</td>
                <td>${escapeHtml(row.tradeType || "Cash")}</td>
                <td>${escapeHtml(row.trader || "Unassigned")}</td>
                <td>${escapeHtml(row.portfolio || "Unassigned")}</td>
                <td>${escapeHtml(row.counterparty || "Unassigned")}</td>
                <td><span class="pill trade-status-pill trade-status-${normalizeToken(row.status)}">${escapeHtml(row.status)}</span></td>
                <td>${escapeHtml(row.side)}</td>
                <td>${formatNumber(row.signedQuantity)}</td>
                <td>${formatCurrency(row.netMarketValue, row.currency || "USD")}</td>
            </tr>
        `)
        .join("");
}

function renderPieChartCard(element, title, copy, model) {
    if (!element) {
        return;
    }

    if (!model || model.total === 0 || model.segments.length === 0) {
        element.innerHTML = `
            <div class="position-chart-card-header">
                <div>
                    <p class="panel-kicker">Exposure Mix</p>
                    <h3>${escapeHtml(title)}</h3>
                </div>
            </div>
            ${createEmptyState("No chart data", "Adjust the filters to bring rows back into scope.")}
        `;
        return;
    }

    const ariaLabel = `${title}: ${model.segments.map(segment => `${segment.label} ${segment.value} rows`).join(", ")}`;
    element.innerHTML = `
        <div class="position-chart-card-header">
            <div>
                <p class="panel-kicker">Exposure Mix</p>
                <h3>${escapeHtml(title)}</h3>
            </div>
            <span class="pill">${model.total} rows</span>
        </div>
        <p class="helper-copy">${escapeHtml(copy)}</p>
        <div class="position-chart-body">
            <div class="position-pie-figure" style="--position-pie-fill: ${escapeHtml(model.gradient)};" role="img" aria-label="${escapeHtml(ariaLabel)}">
                <div class="position-pie-center">
                    <strong>${model.total}</strong>
                    <span>rows</span>
                </div>
            </div>
            <div class="position-chart-legend">
                ${model.segments.map(segment => `
                    <div class="position-chart-legend-row">
                        <span class="position-chart-swatch" style="--position-chart-color: ${escapeHtml(segment.color)};"></span>
                        <div class="position-chart-legend-copy">
                            <strong>${escapeHtml(segment.label)}</strong>
                            <span>${segment.value} rows · ${segment.shareLabel}</span>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function matchesPositionFilters(row) {
    const haystack = [
        row.ticketId,
        row.instrument,
        row.trader,
        row.portfolio,
        row.counterparty,
        row.book,
        row.tradeType,
        row.productType,
        row.assetClass,
        row.strategy
    ].join(" ").toLowerCase();

    if (positionState.search && !haystack.includes(positionState.search)) {
        return false;
    }

    if (!positionState.statuses.has(row.status)) {
        return false;
    }

    if (positionState.assetClass && row.assetClass !== positionState.assetClass) {
        return false;
    }

    if (positionState.tradeType && row.tradeType !== positionState.tradeType) {
        return false;
    }

    if (positionState.trader && !String(row.trader || "").toLowerCase().includes(positionState.trader)) {
        return false;
    }

    if (positionState.portfolio && !String(row.portfolio || "").toLowerCase().includes(positionState.portfolio)) {
        return false;
    }

    if (positionState.counterparty && !String(row.counterparty || "").toLowerCase().includes(positionState.counterparty)) {
        return false;
    }

    if (positionState.product && !String(row.productType || "").toLowerCase().includes(positionState.product)) {
        return false;
    }

    if (positionState.book && !String(row.book || "").toLowerCase().includes(positionState.book)) {
        return false;
    }

    if (positionState.instrument && !String(row.instrument || "").toLowerCase().includes(positionState.instrument)) {
        return false;
    }

    return true;
}

function aggregateGroups(rows, dimension) {
    const groups = new Map();

    for (const row of rows) {
        const label = row[dimension] || "Unassigned";
        const key = String(label);
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                label: key,
                dimensionLabel: humanizeDimension(dimension),
                rows: [],
                rowCount: 0,
                netQuantity: 0,
                grossQuantity: 0,
                netMarketValue: 0,
                grossNotional: 0,
                traders: new Set(),
                portfolios: new Set(),
                books: new Set(),
                counterparties: new Set(),
                instruments: new Set(),
                tradeTypes: new Set(),
                products: new Set(),
                assetClasses: new Set()
            };
            groups.set(key, group);
        }

        group.rows.push(row);
        group.rowCount += 1;
        group.netQuantity += row.signedQuantity;
        group.grossQuantity += Math.abs(row.quantity);
        group.netMarketValue += row.netMarketValue;
        group.grossNotional += row.grossNotional;
        group.traders.add(row.trader || "Unassigned");
        group.portfolios.add(row.portfolio || "Unassigned");
        group.books.add(row.book || "Unassigned");
        group.counterparties.add(row.counterparty || "Unassigned");
        group.instruments.add(row.instrument || "Unassigned");
        group.tradeTypes.add(row.tradeType || "Cash");
        group.products.add(row.productType || "Unassigned");
        group.assetClasses.add(row.assetClass || "Unassigned");
    }

    return [...groups.values()]
        .map(group => ({
            ...group,
            traderCount: group.traders.size,
            portfolioCount: group.portfolios.size,
            bookCount: group.books.size,
            counterpartyCount: group.counterparties.size,
            instrumentCount: group.instruments.size,
            tradeTypeCount: group.tradeTypes.size,
            productCount: group.products.size,
            assetClassCount: group.assetClasses.size
        }))
        .sort((left, right) => Math.abs(right.netMarketValue) - Math.abs(left.netMarketValue));
}

function buildPieChartModel(rows, selector, options = {}) {
    const buckets = new Map();

    for (const row of rows) {
        const label = String(selector(row) || "Unassigned").trim() || "Unassigned";
        buckets.set(label, (buckets.get(label) || 0) + 1);
    }

    let segments = [...buckets.entries()].map(([label, value]) => ({ label, value }));
    segments = sortSegments(segments, options);

    if (Number.isFinite(options.limit) && options.limit > 0 && segments.length > options.limit) {
        const visible = segments.slice(0, options.limit);
        const remaining = segments.slice(options.limit);
        const otherValue = remaining.reduce((sum, segment) => sum + segment.value, 0);
        segments = otherValue > 0
            ? [...visible, { label: "Other", value: otherValue }]
            : visible;
    }

    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    if (total === 0) {
        return {
            total: 0,
            segments: [],
            gradient: "conic-gradient(#233042 0turn 1turn)"
        };
    }

    let runningShare = 0;
    const normalizedSegments = segments.map((segment, index) => {
        const share = segment.value / total;
        const start = runningShare;
        runningShare += share;
        return {
            ...segment,
            share,
            shareLabel: `${(share * 100).toFixed(1)}%`,
            color: PIE_CHART_COLORS[index % PIE_CHART_COLORS.length],
            startLabel: `${(start * 100).toFixed(2)}%`,
            endLabel: `${(runningShare * 100).toFixed(2)}%`
        };
    });

    return {
        total,
        segments: normalizedSegments,
        gradient: `conic-gradient(${normalizedSegments.map(segment => `${segment.color} ${segment.startLabel} ${segment.endLabel}`).join(", ")})`
    };
}

function sortSegments(segments, options) {
    if (Array.isArray(options.order) && options.order.length > 0) {
        const orderIndex = new Map(options.order.map((value, index) => [value, index]));
        return [...segments].sort((left, right) => {
            const leftIndex = orderIndex.has(left.label) ? orderIndex.get(left.label) : Number.MAX_SAFE_INTEGER;
            const rightIndex = orderIndex.has(right.label) ? orderIndex.get(right.label) : Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
            }

            if (right.value !== left.value) {
                return right.value - left.value;
            }

            return left.label.localeCompare(right.label);
        });
    }

    if (typeof options.sort === "function") {
        return [...segments].sort((left, right) => {
            const result = options.sort(left, right);
            if (result !== 0) {
                return result;
            }

            return right.value - left.value;
        });
    }

    return [...segments].sort((left, right) => {
        if (right.value !== left.value) {
            return right.value - left.value;
        }

        return left.label.localeCompare(right.label);
    });
}

function resolveSelectedGroup(groups) {
    if (positionState.selectedGroupKey) {
        const selected = groups.find(group => group.key === positionState.selectedGroupKey);
        if (selected) {
            return selected;
        }
    }

    const first = groups[0] ?? null;
    positionState.selectedGroupKey = first?.key ?? null;
    return first;
}

function uniqueCount(rows, field) {
    return new Set(rows.map(row => row[field]).filter(Boolean)).size;
}

function humanizeDimension(dimension) {
    return {
        portfolio: "Portfolio",
        trader: "Trader",
        counterparty: "Counterparty",
        tradeType: "Trade Type",
        productType: "Product",
        book: "Book",
        assetClass: "Asset Class",
        instrument: "Instrument",
        strategy: "Strategy",
        venue: "Venue"
    }[dimension] || dimension;
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

function normalizeToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
}

function createEmptyState(title, copy) {
    const template = document.getElementById("position-empty-state-template");
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

renderPositions();
