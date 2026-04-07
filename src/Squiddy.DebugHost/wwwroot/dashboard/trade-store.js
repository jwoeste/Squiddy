const SQUIDDY_TRADE_DRAFT_KEY = "squiddy.trade-ticket.v2.draft";
const SQUIDDY_TRADE_BOOK_KEY = "squiddy.trade-ticket.v2.book";
const TRADE_TYPES = ["Cash", "Position", "Contract / OTC"];

function createTradeStore() {
    async function listTradesAsync() {
        const trades = await fetchJson("/trades");
        const normalized = Array.isArray(trades) ? trades.map(normalizeTrade) : [];
        persistBook(mergeSeedTrades(normalized));
        return normalized;
    }

    async function getTradeAsync(ticketId) {
        if (!ticketId) {
            return null;
        }

        try {
            const trade = await fetchJson(`/trades/${encodeURIComponent(ticketId)}`);
            const normalized = normalizeTrade(trade);
            cacheTrade(normalized);
            return normalized;
        }
        catch {
            return null;
        }
    }

    async function saveTradeToServerAsync(trade, audit = {}) {
        const normalized = normalizeTrade(trade);
        const payload = await fetchJson("/trades", {
            method: "POST",
            body: JSON.stringify({
                trade: normalized,
                expectedVersion: Number.isFinite(normalized.version) && normalized.version > 0 ? normalized.version : null,
                actionCode: audit.actionCode || "TRADE_SAVED",
                description: audit.description || null,
                triggerSource: audit.triggerSource || "trade-ticket-ui",
                actorId: audit.actorId || normalized.trader || "trade-operator",
                correlationId: audit.correlationId || normalized.ticketId,
                metadata: audit.metadata || null
            })
        });

        const savedTrade = normalizeTrade(payload.trade);
        cacheTrade(savedTrade);
        return {
            trade: savedTrade,
            audit: payload.audit
        };
    }

    async function listTradeAuditAsync(ticketId) {
        if (!ticketId) {
            return [];
        }

        return await fetchJson(`/trades/${encodeURIComponent(ticketId)}/audit-trail`);
    }

    function loadDraft() {
        const raw = localStorage.getItem(SQUIDDY_TRADE_DRAFT_KEY);
        if (!raw) {
            const seeded = createDefaultTradeDraft();
            saveDraft(seeded);
            return seeded;
        }

        try {
            return normalizeTrade(JSON.parse(raw));
        }
        catch {
            const seeded = createDefaultTradeDraft();
            saveDraft(seeded);
            return seeded;
        }
    }

    function saveDraft(trade) {
        localStorage.setItem(SQUIDDY_TRADE_DRAFT_KEY, JSON.stringify(normalizeTrade(trade)));
    }

    function listTrades() {
        const book = loadBook();
        return [...book].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    function getTrade(ticketId) {
        return loadBook().find(item => item.ticketId === ticketId) ?? null;
    }

    function listPositionRows() {
        return listTrades().flatMap(trade => {
            const allocations = Array.isArray(trade.allocations) && trade.allocations.length > 0
                ? trade.allocations
                : [{ id: `${trade.ticketId}-base`, account: trade.book || "", book: trade.book || "", quantity: trade.quantity }];

            const sign = trade.side === "Sell" ? -1 : 1;

            return allocations.map(allocation => {
                const quantity = Number(allocation.quantity) || 0;
                const grossNotional = quantity * (Number(trade.price) || 0);
                const portfolio = allocation.account || trade.book || "Unassigned";

                return {
                    rowId: `${trade.ticketId}:${allocation.id}`,
                    ticketId: trade.ticketId,
                    status: trade.status,
                    exceptionState: trade.exceptionState,
                    tradeType: trade.tradeType,
                    assetClass: trade.assetClass,
                    productType: trade.productType,
                    instrument: trade.instrument,
                    side: trade.side,
                    trader: trade.trader,
                    portfolio,
                    counterparty: trade.counterparty || "Unassigned",
                    book: allocation.book || trade.book || "Unassigned",
                    strategy: trade.strategy || "Unassigned",
                    quantity,
                    signedQuantity: sign * quantity,
                    price: Number(trade.price) || 0,
                    currency: trade.currency || "USD",
                    grossNotional,
                    netMarketValue: sign * grossNotional,
                    tradeDate: trade.tradeDate,
                    settleDate: trade.settleDate,
                    venue: trade.venue || "Unassigned",
                    broker: trade.broker || "Unassigned",
                    updatedAt: trade.updatedAt,
                    createdAt: trade.createdAt
                };
            });
        });
    }

    function saveTrade(trade) {
        const normalized = normalizeTrade(trade);
        normalized.updatedAt = new Date().toISOString();
        if (!normalized.createdAt) {
            normalized.createdAt = normalized.updatedAt;
        }

        const book = loadBook();
        const index = book.findIndex(item => item.ticketId === normalized.ticketId);
        if (index >= 0) {
            book[index] = normalized;
        }
        else {
            book.push(normalized);
        }

        persistBook(book);
        saveDraft(normalized);
        return normalized;
    }

    function cacheTrade(trade) {
        const normalized = normalizeTrade(trade);
        const book = loadBook();
        const index = book.findIndex(item => item.ticketId === normalized.ticketId);
        if (index >= 0) {
            book[index] = normalized;
        }
        else {
            book.push(normalized);
        }

        persistBook(book);
        saveDraft(normalized);
        return normalized;
    }

    function createNewTradeDraft() {
        const draft = createDefaultTradeDraft();
        saveDraft(draft);
        return draft;
    }

    function seedIfEmpty() {
        const raw = localStorage.getItem(SQUIDDY_TRADE_BOOK_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const merged = mergeSeedTrades(parsed.map(normalizeTrade));
                    persistBook(merged);
                    return;
                }
            }
            catch {
                // Fall through and reseed.
            }
        }

        const book = createSeedTrades();
        persistBook(book);
        if (!localStorage.getItem(SQUIDDY_TRADE_DRAFT_KEY)) {
            saveDraft(book[0]);
        }
    }

    function loadBook() {
        seedIfEmpty();
        const raw = localStorage.getItem(SQUIDDY_TRADE_BOOK_KEY);
        if (!raw) {
            return [];
        }

        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? mergeSeedTrades(parsed.map(normalizeTrade)) : [];
        }
        catch {
            return [];
        }
    }

    function persistBook(book) {
        localStorage.setItem(
            SQUIDDY_TRADE_BOOK_KEY,
            JSON.stringify(book.map(normalizeTrade)));
    }

    function normalizeTrade(candidate) {
        const base = createDefaultTradeDraft();
        const normalized = {
            ...base,
            ...candidate
        };

        normalized.ticketId = normalized.ticketId || createTicketId();
        normalized.version = Number(normalized.version) || 0;
        normalized.assetClass = normalized.assetClass || base.assetClass;
        normalized.productType = normalized.productType || base.productType;
        normalized.instrument = normalized.instrument || "";
        normalized.tradeType = normalizeTradeType(normalized, base.tradeType);
        normalized.exceptionState = normalized.exceptionState || null;
        normalized.workflowId = normalized.workflowId || "trade-ticket";
        normalized.workflowInstanceId = normalized.workflowInstanceId || null;
        normalized.workflowVersion = Number(normalized.workflowVersion) || 0;
        normalized.workflowInstanceVersion = Number(normalized.workflowInstanceVersion) || 0;

        if (normalized.status === "Escalated")
        {
            normalized.status = "Validated";
            normalized.exceptionState = "Escalated";
        }

        normalized.side = normalized.side === "Sell" ? "Sell" : "Buy";
        normalized.quantity = Number(normalized.quantity) || 0;
        normalized.price = Number(normalized.price) || 0;
        normalized.currency = String(normalized.currency || "USD").trim().toUpperCase();
        normalized.book = normalized.book || "";
        normalized.strategy = normalized.strategy || "";
        normalized.trader = normalized.trader || "";
        normalized.counterparty = normalized.counterparty || "";
        normalized.venue = normalized.venue || "";
        normalized.broker = normalized.broker || "";
        normalized.settlementInstruction = normalized.settlementInstruction || "";
        normalized.settlementLocation = normalized.settlementLocation || "";
        normalized.cashAccount = normalized.cashAccount || "";
        normalized.notes = normalized.notes || "";
        normalized.settlementComments = normalized.settlementComments || "";
        normalized.checks = normalizeChecks(normalized.checks);
        normalized.allocations = normalizeAllocations(normalized.allocations);
        normalized.activity = normalizeActivity(normalized.activity);
        normalized.createdAt = normalized.createdAt || new Date().toISOString();
        normalized.updatedAt = normalized.updatedAt || normalized.createdAt;

        return normalized;
    }

    function normalizeTradeType(trade, fallback = "Cash") {
        const explicitValue = String(trade?.tradeType || "").trim();
        const value = explicitValue.toLowerCase();
        if (value === "cash") {
            return "Cash";
        }

        if (value === "position" || value === "position based" || value === "position-based") {
            return "Position";
        }

        if (value === "contract" || value === "contract based" || value === "contract-based" || value === "otc" || value === "contract / otc") {
            return "Contract / OTC";
        }

        const product = String(trade?.productType || "").trim().toLowerCase();
        const instrument = String(trade?.instrument || "").trim().toLowerCase();
        const assetClass = String(trade?.assetClass || "").trim().toLowerCase();

        if (product.includes("position") || instrument.includes("basket") || instrument.includes("transition")) {
            return "Position";
        }

        if (product.includes("swap") || product.includes("forward") || product.includes("option") || product.includes("irs") || assetClass === "rates" || assetClass === "credit" || assetClass === "commodity") {
            return "Contract / OTC";
        }

        return TRADE_TYPES.includes(explicitValue) ? explicitValue : fallback;
    }

    function mergeSeedTrades(existingBook) {
        const merged = [...existingBook];
        const existingIds = new Set(merged.map(trade => trade.ticketId));

        for (const trade of createSeedTrades()) {
            if (!existingIds.has(trade.ticketId)) {
                merged.push(trade);
            }
        }

        return merged.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    function normalizeChecks(checks) {
        const defaults = createDefaultChecks();
        if (!Array.isArray(checks)) {
            return defaults;
        }

        return defaults.map(defaultCheck => {
            const current = checks.find(item => item.id === defaultCheck.id);
            return current
                ? { ...defaultCheck, ...current, passed: Boolean(current.passed) }
                : defaultCheck;
        });
    }

    function normalizeAllocations(allocations) {
        if (!Array.isArray(allocations)) {
            return [];
        }

        return allocations.map(allocation => ({
            id: allocation.id || crypto.randomUUID(),
            account: allocation.account || "",
            book: allocation.book || "",
            quantity: Number(allocation.quantity) || 0
        }));
    }

    function normalizeActivity(activity) {
        if (!Array.isArray(activity) || activity.length === 0) {
            return createDefaultActivity();
        }

        return activity.map(item => ({
            message: item.message || "",
            actor: item.actor || "system",
            timestamp: item.timestamp || new Date().toISOString().replace("T", " ").slice(0, 16)
        })).slice(-20);
    }

    function createDefaultTradeDraft() {
        return {
            ticketId: createTicketId(),
            version: 0,
            status: "Captured",
            tradeType: "Cash",
            assetClass: "Equity",
            productType: "Cash Equity",
            instrument: "AAPL.OQ",
            side: "Buy",
            quantity: 1000,
            price: 192.44,
            currency: "USD",
            tradeDate: "2026-03-27",
            settleDate: "2026-03-30",
            book: "EQ-ARBITRAGE",
            strategy: "Index Rebalance",
            trader: "jwoeste",
            counterparty: "Goldman Sachs",
            venue: "NASDAQ",
            broker: "GSCO",
            settlementInstruction: "DTC-PRIMARY-USD",
            notes: "Generic ticket seeded for desk validation and workflow handling.",
            settlementLocation: "DTC",
            cashAccount: "USD-OPERATIONS-01",
            settlementComments: "",
            exceptionState: null,
            workflowId: "trade-ticket",
            workflowInstanceId: null,
            workflowVersion: 0,
            workflowInstanceVersion: 0,
            checks: createDefaultChecks(),
            allocations: [
                { id: crypto.randomUUID(), account: "FUND-ALPHA", book: "EQ-ARBITRAGE", quantity: 600 },
                { id: crypto.randomUUID(), account: "FUND-BETA", book: "EQ-ARBITRAGE", quantity: 400 }
            ],
            activity: createDefaultActivity(),
            createdAt: "",
            updatedAt: ""
        };
    }

    function createDefaultChecks() {
        return [
            {
                id: "limit",
                label: "Limit check",
                description: "Desk and portfolio limits are within tolerance.",
                passed: true
            },
            {
                id: "compliance",
                label: "Compliance review",
                description: "Restricted list and market abuse checks completed.",
                passed: true
            },
            {
                id: "settlement",
                label: "Settlement ready",
                description: "Standing settlement instructions are present.",
                passed: true
            },
            {
                id: "allocation",
                label: "Allocation complete",
                description: "Parent ticket quantity matches the allocation breakdown.",
                passed: true
            }
        ];
    }

    function createDefaultActivity() {
        return [
            {
                message: "Ticket seeded for operator review.",
                actor: "system",
                timestamp: "2026-03-27 09:15"
            },
            {
                message: "Desk economics captured from intake channel.",
                actor: "workflow",
                timestamp: "2026-03-27 09:17"
            }
        ];
    }

    function createSeedTrades() {
        return [
            normalizeTrade({
                ticketId: "TRD-20260327-001",
                version: 1,
                status: "Approved",
                tradeType: "Cash",
                workflowId: "trade-ticket",
                workflowInstanceId: "TRD-20260327-001",
                workflowVersion: 1,
                workflowInstanceVersion: 3,
                assetClass: "Equity",
                productType: "Cash Equity",
                instrument: "AAPL.OQ",
                side: "Buy",
                quantity: 1000,
                price: 192.44,
                currency: "USD",
                tradeDate: "2026-03-27",
                settleDate: "2026-03-30",
                book: "EQ-ARBITRAGE",
                strategy: "Index Rebalance",
                trader: "jwoeste",
                counterparty: "Goldman Sachs",
                venue: "NASDAQ",
                broker: "GSCO",
                settlementInstruction: "DTC-PRIMARY-USD",
                settlementLocation: "DTC",
                cashAccount: "USD-OPERATIONS-01",
                allocations: [
                    { id: crypto.randomUUID(), account: "FUND-ALPHA", book: "EQ-ARBITRAGE", quantity: 600 },
                    { id: crypto.randomUUID(), account: "FUND-BETA", book: "EQ-ARBITRAGE", quantity: 400 }
                ],
                activity: [
                    { message: "Trade validated by desk controls.", actor: "control", timestamp: "2026-03-27 09:22" },
                    { message: "Approval completed by supervising trader.", actor: "workflow", timestamp: "2026-03-27 09:31" }
                ],
                createdAt: "2026-03-27T09:15:00.000Z",
                updatedAt: "2026-03-27T09:31:00.000Z"
            }),
            normalizeTrade({
                ticketId: "TRD-20260327-002",
                version: 1,
                status: "Pending Approval",
                tradeType: "Cash",
                workflowId: "trade-ticket",
                workflowInstanceId: "TRD-20260327-002",
                workflowVersion: 1,
                workflowInstanceVersion: 2,
                assetClass: "FX",
                productType: "Spot",
                instrument: "EUR/USD",
                side: "Sell",
                quantity: 5000000,
                price: 1.0821,
                currency: "USD",
                tradeDate: "2026-03-27",
                settleDate: "2026-03-29",
                book: "G10-MACRO",
                strategy: "Macro Hedge",
                trader: "mchan",
                counterparty: "JPMorgan",
                venue: "360T",
                broker: "JPM",
                settlementInstruction: "CLS-USD",
                settlementLocation: "CLS",
                cashAccount: "USD-FX-SETTLEMENT",
                allocations: [
                    { id: crypto.randomUUID(), account: "MACRO-01", book: "G10-MACRO", quantity: 3000000 },
                    { id: crypto.randomUUID(), account: "MACRO-02", book: "G10-MACRO", quantity: 2000000 }
                ],
                createdAt: "2026-03-27T08:40:00.000Z",
                updatedAt: "2026-03-27T09:10:00.000Z"
            }),
            normalizeTrade({
                ticketId: "TRD-20260327-003",
                version: 1,
                status: "Validated",
                exceptionState: "Escalated",
                tradeType: "Contract / OTC",
                workflowId: "trade-ticket",
                workflowInstanceId: "TRD-20260327-003",
                workflowVersion: 1,
                workflowInstanceVersion: 2,
                assetClass: "Rates",
                productType: "IRS",
                instrument: "USD 5Y SWAP",
                side: "Buy",
                quantity: 25000000,
                price: 99.125,
                currency: "USD",
                tradeDate: "2026-03-27",
                settleDate: "2026-03-29",
                book: "RATES-USD",
                strategy: "Duration Overlay",
                trader: "arossi",
                counterparty: "",
                venue: "Tradeweb",
                broker: "TW",
                settlementInstruction: "",
                settlementLocation: "",
                cashAccount: "",
                checks: [
                    {
                        id: "limit",
                        label: "Limit check",
                        description: "Desk and portfolio limits are within tolerance.",
                        passed: true
                    },
                    {
                        id: "compliance",
                        label: "Compliance review",
                        description: "Restricted list and market abuse checks completed.",
                        passed: true
                    },
                    {
                        id: "settlement",
                        label: "Settlement ready",
                        description: "Standing settlement instructions are present.",
                        passed: false
                    },
                    {
                        id: "allocation",
                        label: "Allocation complete",
                        description: "Parent ticket quantity matches the allocation breakdown.",
                        passed: false
                    }
                ],
                allocations: [],
                createdAt: "2026-03-27T07:55:00.000Z",
                updatedAt: "2026-03-27T08:18:00.000Z"
            }),
            normalizeTrade({
                ticketId: "TRD-20260327-004",
                version: 1,
                status: "Captured",
                tradeType: "Position",
                workflowId: "trade-ticket",
                workflowInstanceId: null,
                workflowVersion: 1,
                workflowInstanceVersion: 0,
                assetClass: "Fund",
                productType: "Position Transfer",
                instrument: "MSCI WORLD BASKET",
                side: "Buy",
                quantity: 125000,
                price: 1,
                currency: "USD",
                tradeDate: "2026-03-27",
                settleDate: "2026-03-30",
                book: "MULTI-ASSET-CORE",
                strategy: "Portfolio Rebalance",
                trader: "lthomsen",
                counterparty: "Northern Trust",
                venue: "Internal Crossing",
                broker: "In House",
                settlementInstruction: "CUSTODY-POSITION-XFER",
                settlementLocation: "State Street",
                cashAccount: "USD-CUSTODY-01",
                allocations: [
                    { id: crypto.randomUUID(), account: "PENSION-01", book: "MULTI-ASSET-CORE", quantity: 75000 },
                    { id: crypto.randomUUID(), account: "PENSION-02", book: "MULTI-ASSET-CORE", quantity: 50000 }
                ],
                activity: [
                    { message: "Position-based rebalance ticket captured from portfolio transition workflow.", actor: "workflow", timestamp: "2026-03-27 10:02" }
                ],
                createdAt: "2026-03-27T10:02:00.000Z",
                updatedAt: "2026-03-27T10:04:00.000Z"
            })
        ];
    }

    function createTicketId() {
        const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        const suffix = Math.floor(Math.random() * 900 + 100);
        return `TRD-${datePart}-${suffix}`;
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json"
            },
            ...options
        });

        const text = await response.text();
        let payload = null;
        if (text) {
            try {
                payload = JSON.parse(text);
            }
            catch {
                throw new Error(text);
            }
        }

        if (!response.ok) {
            throw new Error(payload?.error || text || `Request failed with status ${response.status}.`);
        }

        return payload;
    }

    return {
        loadDraft,
        saveDraft,
        listTrades,
        listTradesAsync,
        listPositionRows,
        getTrade,
        getTradeAsync,
        saveTrade,
        cacheTrade,
        saveTradeToServerAsync,
        listTradeAuditAsync,
        createNewTradeDraft,
        createDefaultTradeDraft,
        seedIfEmpty,
        tradeTypes: TRADE_TYPES
    };
}

window.SquiddyTradeStore = createTradeStore();
