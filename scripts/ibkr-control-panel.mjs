#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const PANEL_PORT = Number(process.env.IBKR_PANEL_PORT ?? 8913);
const DEFAULT_BIN_DIR = "/Users/kmarkosyan/Downloads/clientportal.gw/bin";
const CPGW_BIN_DIR = process.env.IBKR_CPGW_BIN_DIR ?? DEFAULT_BIN_DIR;
const CPGW_RUN_SH = path.join(CPGW_BIN_DIR, "run.sh");
const CPGW_HOME_DIR = path.resolve(CPGW_BIN_DIR, "..");
const CPGW_CONF_INPUT = process.env.IBKR_CPGW_CONF ?? "root/conf.yaml";
const CPGW_BASE = process.env.IBKR_CPGW_BASE_URL ?? "https://localhost:5000/v1/api";
const CPGW_LOGIN_URL = process.env.IBKR_CPGW_LOGIN_URL ?? "https://localhost:5000";
const DEFAULT_ACCOUNT_ID = process.env.IBKR_ACCOUNT_ID ?? "U18542108";
const APP_SYNC_URL = process.env.IBKR_APP_SYNC_URL ?? "";
const APP_SYNC_TOKEN = process.env.IBKR_SYNC_TOKEN ?? "";
const PANEL_AUTO_OPEN = process.env.IBKR_PANEL_AUTO_OPEN === "1";
const now = new Date();
const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
const YTD_DAYS = Math.max(1, Math.floor((Date.now() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1);
const DEFAULT_TRADES_DAYS = Number(process.env.IBKR_TRADES_DAYS ?? YTD_DAYS);
const DEFAULT_AUTO_SYNC_SECONDS = Number(process.env.IBKR_AUTO_SYNC_SECONDS ?? 60);
const AUTO_SYNC_CHOICES = [3, 10, 30, 60, 300, 600, 3600];
const RESOLVED_DEFAULT_AUTO_SYNC_SECONDS = AUTO_SYNC_CHOICES.includes(DEFAULT_AUTO_SYNC_SECONDS) ? DEFAULT_AUTO_SYNC_SECONDS : 60;
const DEFAULT_AUTO_SYNC_ENABLED =
  process.env.IBKR_AUTO_SYNC_ENABLED === "1" &&
  Boolean(APP_SYNC_URL.trim()) &&
  Boolean(APP_SYNC_TOKEN.trim());

const state = {
  gatewayProcess: null,
  preview: null,
  lastSyncResponse: null,
  logs: [],
  preferences: {
    accountId: DEFAULT_ACCOUNT_ID,
    days: Number.isFinite(DEFAULT_TRADES_DAYS) ? Math.max(1, Math.min(3650, DEFAULT_TRADES_DAYS)) : YTD_DAYS,
    syncMode: "live",
  },
  autoSync: {
    enabled: false,
    intervalSeconds: RESOLVED_DEFAULT_AUTO_SYNC_SECONDS,
    timer: null,
    inFlight: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
  },
};
let panelShuttingDown = false;

function nowIso() {
  return new Date().toISOString();
}

function pushLog(line) {
  const item = `[${new Date().toLocaleTimeString()}] ${line}`;
  state.logs.push(item);
  if (state.logs.length > 300) {
    state.logs = state.logs.slice(-300);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function normalizeConfArg(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "root/conf.yaml";

  if (!path.isAbsolute(trimmed)) {
    return trimmed;
  }

  const relative = path.relative(CPGW_HOME_DIR, trimmed);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative || "root/conf.yaml";
  }

  return trimmed;
}

function terminalHyperlink(url, label = url) {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function fetchJson(url, init = {}) {
  try {
    const resp = await fetch(url, { cache: "no-store", ...init });
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return {
      ok: resp.ok,
      status: resp.status,
      data: json,
      error: resp.ok ? null : `HTTP ${resp.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

function toNum(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  if (value && typeof value === "object") {
    const candidate =
      toNum(value.value) ??
      toNum(value.amount) ??
      toNum(value.val) ??
      toNum(value.displayValue);
    if (candidate != null) return candidate;
  }
  return null;
}

function resolveEndpointSpec(endpointId, accountId, days, symbol, conids) {
  const safeAccount = String(accountId || DEFAULT_ACCOUNT_ID).trim();
  const safeDays = Number.isFinite(Number(days))
    ? Math.max(1, Math.min(3650, Number(days)))
    : state.preferences.days;
  const safeSymbol = String(symbol || "").trim().toUpperCase() || "AAPL";
  const safeConids = String(conids || "").trim() || "265598";

  switch (endpointId) {
    case "auth-status":
      return {
        id: endpointId,
        label: "Auth Status",
        method: "GET",
        url: `${CPGW_BASE}/iserver/auth/status`,
      };
    case "accounts":
      return {
        id: endpointId,
        label: "Accounts",
        method: "GET",
        url: `${CPGW_BASE}/iserver/accounts`,
      };
    case "summary":
      return {
        id: endpointId,
        label: "Portfolio Summary",
        method: "GET",
        url: `${CPGW_BASE}/portfolio/${encodeURIComponent(safeAccount)}/summary`,
      };
    case "ledger":
      return {
        id: endpointId,
        label: "Portfolio Ledger",
        method: "GET",
        url: `${CPGW_BASE}/portfolio/${encodeURIComponent(safeAccount)}/ledger`,
      };
    case "positions-v2":
      return {
        id: endpointId,
        label: "Positions v2",
        method: "GET",
        url: `${CPGW_BASE}/portfolio2/${encodeURIComponent(safeAccount)}/positions`,
      };
    case "positions-v2-page0":
      return {
        id: endpointId,
        label: "Positions v2 Page 0",
        method: "GET",
        url: `${CPGW_BASE}/portfolio2/${encodeURIComponent(safeAccount)}/positions/0`,
      };
    case "positions-v1-page0":
      return {
        id: endpointId,
        label: "Positions v1 Page 0",
        method: "GET",
        url: `${CPGW_BASE}/portfolio/${encodeURIComponent(safeAccount)}/positions/0`,
      };
    case "trades":
      return {
        id: endpointId,
        label: "Trades Window",
        method: "GET",
        url: `${CPGW_BASE}/iserver/account/trades?days=${safeDays}`,
      };
    case "secdef-search":
      return {
        id: endpointId,
        label: "SecDef Search",
        method: "GET",
        url: `${CPGW_BASE}/iserver/secdef/search?symbol=${encodeURIComponent(safeSymbol)}`,
      };
    case "marketdata-snapshot":
      return {
        id: endpointId,
        label: "MarketData Snapshot",
        method: "GET",
        url: `${CPGW_BASE}/iserver/marketdata/snapshot?conids=${encodeURIComponent(safeConids)}&fields=31,55,84,86`,
      };
    case "tickle":
      return {
        id: endpointId,
        label: "Tickle",
        method: "GET",
        url: `${CPGW_BASE}/tickle`,
      };
    default:
      return null;
  }
}

function listEndpointSpecs(accountId, days, symbol, conids) {
  const ids = [
    "auth-status",
    "accounts",
    "summary",
    "ledger",
    "positions-v2",
    "positions-v2-page0",
    "positions-v1-page0",
    "trades",
    "secdef-search",
    "marketdata-snapshot",
    "tickle",
  ];
  return ids
    .map((id) => resolveEndpointSpec(id, accountId, days, symbol, conids))
    .filter((item) => item != null);
}

function parseAccounts(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(data.accounts)) {
    return data.accounts.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(data.accountIds)) {
    return data.accountIds.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function normalizeSummary(data) {
  if (Array.isArray(data)) {
    const out = {};
    for (const row of data) {
      const key = row?.tag ?? row?.key ?? row?.name;
      if (!key) continue;
      out[String(key)] = row?.value ?? row?.amount ?? row?.val ?? null;
    }
    return out;
  }

  if (data && typeof data === "object") {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object") {
        const hasValueField = Object.prototype.hasOwnProperty.call(v, "value");
        const value = hasValueField ? v.value : null;
        const amount = Object.prototype.hasOwnProperty.call(v, "amount") ? v.amount : null;
        const valueNum = toNum(value);
        const amountNum = toNum(amount);
        const hasMeaningfulValue =
          value != null &&
          String(value).trim() !== "" &&
          String(value).trim().toLowerCase() !== "null";

        if (valueNum != null) {
          out[k] = valueNum;
        } else if (hasMeaningfulValue) {
          out[k] = value;
        } else if (amountNum != null) {
          out[k] = amountNum;
        } else {
          out[k] = v;
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  return {};
}

function normalizeSummaryFromLedger(data) {
  if (!data || typeof data !== "object") return {};
  const obj = data;
  const segment =
    (obj.BASE && typeof obj.BASE === "object" ? obj.BASE : null) ??
    (obj.USD && typeof obj.USD === "object" ? obj.USD : null) ??
    (Object.values(obj).find((value) => value && typeof value === "object") ?? null);
  if (!segment || typeof segment !== "object") return {};

  const read = (...keys) => {
    for (const key of keys) {
      if (!(key in segment)) continue;
      const value = toNum(segment[key]);
      if (value != null) return value;
    }
    return null;
  };

  const merged = {};
  const netLiq = read("netliquidationvalue", "netliquidation", "netliq");
  const cash = read("cashbalance", "totalcashvalue", "cash");
  const buyingPower = read("buyingpower", "buying_power");
  const maint = read("maintmarginreq", "maint_margin_req", "maintmargin");
  const excess = read("excessliquidity", "excess_liquidity");

  if (netLiq != null) merged.netLiquidation = netLiq;
  if (cash != null) merged.totalCashValue = cash;
  if (buyingPower != null) merged.buyingPower = buyingPower;
  if (maint != null) merged.maintMarginReq = maint;
  if (excess != null) merged.excessLiquidity = excess;
  return merged;
}

function normalizePositions(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const symbol = String(
      row.ticker ??
        row.symbol ??
        row.contractDesc ??
        row.contract_description ??
        "",
    ).trim();
    return {
      symbol,
      contract: String(row.contractDesc ?? row.description ?? row.contract_description ?? "").trim(),
      conid: toNum(row.conid ?? row.contractConid),
      quantity: toNum(row.position ?? row.pos ?? row.quantity ?? row.size) ?? 0,
      market_price: toNum(row.mktPrice ?? row.marketPrice ?? row.lastPrice),
      market_value: toNum(row.mktValue ?? row.marketValue ?? row.marketValueBase),
      average_cost: toNum(row.avgCost ?? row.averageCost ?? row.avgPrice),
      unrealized_pl: toNum(row.unrealizedPnl ?? row.unrealizedPNL ?? row.uPnl),
      realized_pl: toNum(row.realizedPnl ?? row.realizedPNL ?? row.rPnl),
      currency: row.currency ? String(row.currency) : null,
      raw: row,
    };
  });
}

function normalizeTrades(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const qty = toNum(row.quantity ?? row.qty ?? row.size ?? row.shares) ?? 0;
    return {
      trade_id: row.execution_id ? String(row.execution_id) : row.exec_id ? String(row.exec_id) : null,
      symbol: String(row.symbol ?? row.contract_description ?? row.description ?? "").trim(),
      side: row.side ? String(row.side) : qty < 0 ? "SELL" : qty > 0 ? "BUY" : null,
      quantity: Math.abs(qty),
      price: toNum(row.price ?? row.trade_price ?? row.avg_price),
      commission: toNum(row.commission ?? row.commission_amount),
      trade_time: row.trade_time ? String(row.trade_time) : row.timestamp ? String(row.timestamp) : null,
      conid: toNum(row.conid ?? row.contract_id),
      raw: row,
    };
  });
}

function parseOptionTickerFromPosition(row) {
  const raw = `${row.symbol ?? ""} ${row.contract ?? ""}`.toUpperCase();
  const match = raw.match(/([A-Z.]+)\s+\d{6}[CP]\d{8}/);
  if (!match) return null;
  return String(match[1]).trim();
}

function parseSnapshotPrice(rawRow) {
  if (!rawRow || typeof rawRow !== "object") return null;
  const candidates = [
    rawRow["31"],
    rawRow["55"],
    rawRow["84"],
    rawRow["86"],
    rawRow.last,
    rawRow.last_price,
    rawRow.marketPrice,
  ];
  for (const candidate of candidates) {
    const value = toNum(candidate);
    if (value != null) return value;
  }
  return null;
}

async function fetchUnderlyingPricesFromIbkr(accountId, positions) {
  const notes = [];
  const underlyings = {};

  const tickers = [
    ...new Set(
      positions
        .map((row) => parseOptionTickerFromPosition(row))
        .filter((value) => typeof value === "string" && value.length > 0),
    ),
  ];

  if (tickers.length === 0) {
    return { underlyings, notes };
  }

  const tickerToConid = new Map();
  for (const ticker of tickers) {
    const secdef = await fetchJson(`${CPGW_BASE}/iserver/secdef/search?symbol=${encodeURIComponent(ticker)}`);
    if (!secdef.ok || !Array.isArray(secdef.data)) {
      notes.push(`Underlying secdef failed for ${ticker} (${secdef.status})`);
      continue;
    }

    const chosen =
      secdef.data.find((item) => toNum(item?.conid) != null && String(item?.symbol ?? "").toUpperCase() === ticker) ??
      secdef.data.find((item) => toNum(item?.conid) != null);
    const conid = toNum(chosen?.conid);
    if (conid == null) {
      notes.push(`Underlying conid missing for ${ticker}`);
      continue;
    }
    tickerToConid.set(ticker, conid);
  }

  if (tickerToConid.size === 0) {
    return { underlyings, notes };
  }

  const conids = [...tickerToConid.values()];
  const chunks = [];
  for (let i = 0; i < conids.length; i += 40) {
    chunks.push(conids.slice(i, i + 40));
  }

  const rowByConid = new Map();
  for (const chunk of chunks) {
    const url = `${CPGW_BASE}/iserver/marketdata/snapshot?conids=${chunk.join(",")}&fields=31,55,84,86`;
    // IBKR snapshot often needs a warm-up call.
    await fetchJson(url);
    const snap = await fetchJson(url);
    if (!snap.ok || !Array.isArray(snap.data)) {
      notes.push(`Underlying snapshot failed (${snap.status})`);
      continue;
    }
    for (const row of snap.data) {
      const conid = toNum(row?.conid);
      if (conid == null) continue;
      rowByConid.set(conid, row);
    }
  }

  for (const [ticker, conid] of tickerToConid.entries()) {
    const row = rowByConid.get(conid);
    const price = parseSnapshotPrice(row);
    if (price == null) {
      notes.push(`Underlying price missing for ${ticker}`);
      continue;
    }
    underlyings[ticker] = Number(price.toFixed(4));
  }

  return { underlyings, notes };
}

function gatewayRunning() {
  return Boolean(state.gatewayProcess && state.gatewayProcess.exitCode == null && !state.gatewayProcess.killed);
}

function startGateway() {
  if (gatewayRunning()) {
    return { ok: true, message: "Gateway already running." };
  }

  const confArg = normalizeConfArg(CPGW_CONF_INPUT);
  const proc = spawn(CPGW_RUN_SH, [confArg], {
    cwd: CPGW_HOME_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  state.gatewayProcess = proc;
  pushLog(`Starting CPGW: ${CPGW_RUN_SH} ${confArg}`);

  proc.stdout?.on("data", (chunk) => pushLog(`[cpgw] ${String(chunk).trim()}`));
  proc.stderr?.on("data", (chunk) => pushLog(`[cpgw:err] ${String(chunk).trim()}`));
  proc.on("close", (code) => {
    state.gatewayProcess = null;
    pushLog(`CPGW exited (code=${code ?? "null"})`);
  });

  return { ok: true, message: "Gateway start command sent." };
}

function stopGateway() {
  if (!gatewayRunning()) {
    return { ok: true, message: "Gateway is not running." };
  }
  const pid = state.gatewayProcess?.pid;
  if (!pid) {
    return { ok: true, message: "Gateway PID not found; considered stopped." };
  }

  let signaled = false;
  try {
    process.kill(-pid, "SIGTERM");
    signaled = true;
  } catch {
    // fallback to direct process signal
  }
  if (!signaled) {
    try {
      process.kill(pid, "SIGTERM");
      signaled = true;
    } catch {
      // ignore
    }
  }

  setTimeout(() => {
    if (!gatewayRunning()) return;
    try {
      process.kill(-pid, "SIGKILL");
      pushLog("Gateway force-killed via process group.");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
        pushLog("Gateway force-killed via PID.");
      } catch {
        pushLog("Gateway did not respond to stop signals.");
      }
    }
  }, 1800);

  return { ok: true, message: signaled ? "Gateway stop signal sent." : "Gateway signal failed; will retry kill." };
}

function shutdownPanelProcess() {
  if (panelShuttingDown) return;
  panelShuttingDown = true;

  if (state.autoSync.timer) {
    clearInterval(state.autoSync.timer);
    state.autoSync.timer = null;
  }
  state.autoSync.enabled = false;

  if (gatewayRunning()) {
    stopGateway();
  }

  const forceExit = setTimeout(() => {
    process.exit(0);
  }, 2500);

  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}

async function fetchAuthStatus() {
  const auth = await fetchJson(`${CPGW_BASE}/iserver/auth/status`);
  return {
    gateway_running: gatewayRunning(),
    auth_ok: auth.ok,
    auth_status: auth.status,
    authenticated: Boolean(auth.data?.authenticated),
    connected: Boolean(auth.data?.connected),
    competing: Boolean(auth.data?.competing),
    message: auth.data?.message ?? auth.error,
    raw: auth.data,
  };
}

async function buildPreview(accountIdInput, daysInput, options = {}) {
  const includeTrades = options.includeTrades !== false;
  const includeUnderlyings = options.includeUnderlyings !== false;
  const notes = [];
  const auth = await fetchAuthStatus();
  if (!auth.authenticated || !auth.connected) {
    throw new Error("IBKR session is not authenticated and connected.");
  }

  const accountsResp = await fetchJson(`${CPGW_BASE}/iserver/accounts`);
  const accounts = parseAccounts(accountsResp.data);
  const accountId = String(accountIdInput || accounts[0] || DEFAULT_ACCOUNT_ID).trim();
  if (!accountId) {
    throw new Error("No account ID found.");
  }
  if (accounts.length > 0 && !accounts.includes(accountId)) {
    notes.push(`Requested account ${accountId} not found in /iserver/accounts response.`);
  }

  const summaryResp = await fetchJson(`${CPGW_BASE}/portfolio/${encodeURIComponent(accountId)}/summary`);
  const ledgerResp = await fetchJson(`${CPGW_BASE}/portfolio/${encodeURIComponent(accountId)}/ledger`);

  let positionsResp = await fetchJson(`${CPGW_BASE}/portfolio2/${encodeURIComponent(accountId)}/positions`);
  if (!positionsResp.ok || !Array.isArray(positionsResp.data)) {
    positionsResp = await fetchJson(`${CPGW_BASE}/portfolio2/${encodeURIComponent(accountId)}/positions/0`);
  }
  if (!positionsResp.ok || !Array.isArray(positionsResp.data)) {
    positionsResp = await fetchJson(`${CPGW_BASE}/portfolio/${encodeURIComponent(accountId)}/positions/0`);
  }

  const days = Number.isFinite(Number(daysInput))
    ? Math.max(1, Math.min(3650, Number(daysInput)))
    : YTD_DAYS;
  state.preferences.accountId = accountId;
  state.preferences.days = days;
  const tradesResp = includeTrades
    ? await fetchJson(`${CPGW_BASE}/iserver/account/trades?days=${days}`)
    : { ok: true, status: 200, data: [], error: null };

  if (!summaryResp.ok && !ledgerResp.ok) {
    notes.push(`Summary request failed (${summaryResp.status}); ledger failed (${ledgerResp.status}).`);
  } else if (!summaryResp.ok && ledgerResp.ok) {
    notes.push(`Summary request failed (${summaryResp.status}); using ledger fallback.`);
  }
  if (!positionsResp.ok) notes.push(`Positions request failed (${positionsResp.status}).`);
  if (includeTrades) {
    if (!tradesResp.ok) notes.push(`Trades request failed (${tradesResp.status}).`);
  } else {
    notes.push("trades_skipped=1");
  }

  const summary = {
    ...normalizeSummary(summaryResp.data),
    ...normalizeSummaryFromLedger(ledgerResp.data),
  };

  const normalizedPositions = normalizePositions(positionsResp.data);
  if (includeUnderlyings) {
    const fetched = await fetchUnderlyingPricesFromIbkr(accountId, normalizedPositions);
    if (Object.keys(fetched.underlyings).length > 0) {
      summary.__underlying_prices = fetched.underlyings;
      notes.push(`underlyings=${Object.keys(fetched.underlyings).length}`);
    }
    if (fetched.notes.length > 0) {
      notes.push(...fetched.notes);
    }
  }

  const preview = {
    account_id: accountId,
    source: "cpgw-local",
    fetched_at: nowIso(),
    summary,
    positions: normalizedPositions,
    trades: includeTrades ? normalizeTrades(tradesResp.data) : [],
    notes: includeTrades ? [...notes, `trades_days=${days}`] : notes,
      meta: {
        accounts,
        endpoints: {
          summary: `${CPGW_BASE}/portfolio/${accountId}/summary`,
          ledger: `${CPGW_BASE}/portfolio/${accountId}/ledger`,
          positions: "portfolio2/positions fallback chain",
          trades: includeTrades ? `${CPGW_BASE}/iserver/account/trades?days=${days}` : "skipped",
        },
      },
  };

  state.preview = preview;
  pushLog(`Preview fetched: ${preview.positions.length} positions, ${preview.trades.length} trades.`);
  return preview;
}

async function syncPreview(preview, body = {}) {
  const appSyncUrl = String(body.appSyncUrl ?? APP_SYNC_URL).trim();
  const token = String(body.token ?? APP_SYNC_TOKEN).trim();
  if (!appSyncUrl) {
    throw new Error("IBKR_APP_SYNC_URL is not configured.");
  }
  if (!token) {
    throw new Error("IBKR_SYNC_TOKEN is not configured.");
  }

  const resp = await fetchJson(appSyncUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ibkr-sync-token": token,
    },
    body: JSON.stringify(preview),
  });

  if (!resp.ok) {
    const message = typeof resp.data?.error === "string" ? resp.data.error : `Sync failed (${resp.status})`;
    throw new Error(message);
  }

  state.lastSyncResponse = resp.data;
  return resp.data;
}

async function clearRemoteIbkrDb(body = {}) {
  const appSyncUrl = String(body.appSyncUrl ?? APP_SYNC_URL).trim();
  const token = String(body.token ?? APP_SYNC_TOKEN).trim();
  if (!appSyncUrl) {
    throw new Error("IBKR_APP_SYNC_URL is not configured.");
  }
  if (!token) {
    throw new Error("IBKR_SYNC_TOKEN is not configured.");
  }

  const resp = await fetchJson(appSyncUrl, {
    method: "DELETE",
    headers: {
      "x-ibkr-sync-token": token,
    },
  });
  if (!resp.ok) {
    const message =
      typeof resp.data?.error === "string" ? resp.data.error : `Clear failed (${resp.status})`;
    throw new Error(message);
  }
  return resp.data;
}

async function runAutoSyncCycle(force = false) {
  if ((!state.autoSync.enabled && !force) || state.autoSync.inFlight) return;
  state.autoSync.inFlight = true;
  state.autoSync.lastAttemptAt = nowIso();
  state.autoSync.lastError = null;

  try {
    const auth = await fetchAuthStatus();
    if (!auth.authenticated || !auth.connected) {
      throw new Error("Session not authenticated/connected.");
    }
    const preview = await buildPreview(state.preferences.accountId, state.preferences.days, {
      includeTrades: false,
    });
    await syncPreview(preview);
    state.autoSync.lastSuccessAt = nowIso();
    pushLog("Auto-sync cycle completed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-sync failed";
    state.autoSync.lastError = message;
    pushLog(`Auto-sync error: ${message}`);
  } finally {
    state.autoSync.inFlight = false;
  }
}

function setAutoSyncEnabled(enabled) {
  const next = Boolean(enabled);
  state.autoSync.enabled = next;
  if (state.autoSync.timer) {
    clearInterval(state.autoSync.timer);
    state.autoSync.timer = null;
  }
  if (!next) {
    pushLog("Auto-sync disabled.");
    return;
  }
  const intervalMs = Math.max(3, Number(state.autoSync.intervalSeconds) || 60) * 1000;
  state.autoSync.timer = setInterval(() => {
    void runAutoSyncCycle();
  }, intervalMs);
  pushLog(`Auto-sync enabled (${state.autoSync.intervalSeconds}s interval).`);
  void runAutoSyncCycle();
}

function html() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>IBKR Control Panel</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#07090d; color:#dce3ee; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 18px; }
    .card { border:1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px; margin-bottom: 10px; background: rgba(255,255,255,0.02); }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .btn { border:1px solid rgba(130,140,248,.5); background: rgba(130,140,248,.12); color:#9aa4ff; border-radius: 6px; padding: 7px 11px; cursor:pointer; font-weight:600; font-size:12px; }
    .btn.green { border-color: rgba(74,222,128,.55); background: rgba(74,222,128,.12); color:#5de790; }
    .btn.gray { border-color: rgba(255,255,255,.2); background: rgba(255,255,255,.04); color:#c7ced8; }
    .btn.red { border-color: rgba(248,113,113,.55); background: rgba(248,113,113,.12); color:#f99494; }
    .input { background: rgba(0,0,0,.35); color:#dce3ee; border:1px solid rgba(255,255,255,.15); border-radius: 6px; padding:7px 9px; font-size:12px; min-width:160px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; }
    .ok { color:#4ade80; }
    .bad { color:#f87171; }
    pre { background: rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:10px; overflow:auto; max-height:360px; white-space: pre-wrap; }
    a { color:#9aa4ff; }
    .muted { color:#8b98aa; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h2 style="margin:0 0 10px 0;">IBKR Control Panel</h2>

    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div class="mono">CPGW: <span id="gatewayState">checking…</span></div>
        <div class="mono">Auth: <span id="authState">checking…</span></div>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn" id="btnStart">Start Gateway</button>
        <button class="btn red" id="btnStop">Stop Gateway</button>
        <a class="btn gray" href="${CPGW_LOGIN_URL}" target="_blank" rel="noreferrer">Open Login</a>
        <button class="btn gray" id="btnCheck">Check Session</button>
      </div>
      <div class="muted" style="margin-top:8px;">
        Bin: <span class="mono">${CPGW_BIN_DIR}</span> · Conf: <span class="mono">${normalizeConfArg(CPGW_CONF_INPUT)}</span>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <label class="muted">Account ID</label>
        <input id="accountId" class="input mono" value="${DEFAULT_ACCOUNT_ID}" />
        <label class="muted">History Days (manual)</label>
        <input id="days" class="input mono" value="${Number.isFinite(DEFAULT_TRADES_DAYS) ? Math.max(1, Math.min(3650, DEFAULT_TRADES_DAYS)) : YTD_DAYS}" />
        <label class="muted">Sync Mode</label>
        <select id="syncMode" class="input mono" style="min-width:160px;">
          <option value="live" selected>Live only</option>
          <option value="history">Full history</option>
        </select>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn green" id="btnFetch">Fetch Live Preview</button>
        <button class="btn gray" id="btnFetchHistory">Fetch Full History</button>
        <button class="btn gray" id="btnFetchUnderlyings">Fetch Underlyings</button>
        <button class="btn green" id="btnSync">Sync To DB</button>
        <button class="btn red" id="btnClearResync">Clear IBKR DB + Full Resync</button>
        <span class="muted">Sync does fetch+sync. Auto-sync fetches summary + positions (no trades).</span>
      </div>
      <div id="previewMeta" class="muted" style="margin-top:8px;">No preview loaded.</div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div class="mono">Auto-sync: <span id="autoSyncState">off</span></div>
        <div class="mono">Heartbeat: <span id="autoSyncHeartbeat">—</span></div>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn" id="btnAutoToggle">Enable Auto Sync</button>
        <button class="btn gray" id="btnAutoRun">Run Now</button>
        <label class="muted">Interval</label>
        <select id="autoSyncInterval" class="input mono" style="min-width:120px;">
          ${AUTO_SYNC_CHOICES.map((value) => `<option value="${value}" ${value === RESOLVED_DEFAULT_AUTO_SYNC_SECONDS ? "selected" : ""}>${value >= 60 ? `${Math.round(value / 60)}m` : `${value}s`}</option>`).join("")}
        </select>
      </div>
      <div id="autoSyncMeta" class="muted" style="margin-top:8px;">Auto-sync disabled.</div>
    </div>

    <div class="card">
      <div class="mono" style="margin-bottom:6px;">Preview JSON</div>
      <pre id="previewOutput">—</pre>
    </div>

    <div class="card">
      <div class="mono" style="margin-bottom:6px;">IBKR Endpoint Tester</div>
      <div class="row" style="margin-bottom:8px;">
        <select id="endpointSelect" class="input mono" style="min-width:280px;"></select>
        <label class="muted">Symbol</label>
        <input id="endpointSymbol" class="input mono" value="AAPL" style="min-width:110px;" />
        <label class="muted">Conids</label>
        <input id="endpointConids" class="input mono" value="265598" style="min-width:160px;" />
        <button class="btn gray" id="btnEndpointFetch">Fetch Endpoint</button>
      </div>
      <div class="muted" style="margin-bottom:6px;">
        Endpoints used by preview: accounts, summary, ledger, positions (fallback chain), trades window, secdef + marketdata snapshot.
      </div>
      <pre id="endpointOutput">—</pre>
    </div>

    <div class="card">
      <div class="mono" style="margin-bottom:6px;">Panel Logs</div>
      <pre id="logOutput">—</pre>
    </div>
  </div>

  <script>
    const gatewayState = document.getElementById("gatewayState");
    const authState = document.getElementById("authState");
    const previewOutput = document.getElementById("previewOutput");
    const endpointOutput = document.getElementById("endpointOutput");
    const endpointSelect = document.getElementById("endpointSelect");
    const endpointSymbol = document.getElementById("endpointSymbol");
    const endpointConids = document.getElementById("endpointConids");
    const btnEndpointFetch = document.getElementById("btnEndpointFetch");
    const previewMeta = document.getElementById("previewMeta");
    const logOutput = document.getElementById("logOutput");
    const btnFetch = document.getElementById("btnFetch");
    const btnFetchHistory = document.getElementById("btnFetchHistory");
    const btnFetchUnderlyings = document.getElementById("btnFetchUnderlyings");
    const btnSync = document.getElementById("btnSync");
    const btnClearResync = document.getElementById("btnClearResync");
    const autoSyncState = document.getElementById("autoSyncState");
    const autoSyncHeartbeat = document.getElementById("autoSyncHeartbeat");
    const autoSyncMeta = document.getElementById("autoSyncMeta");
    const autoSyncInterval = document.getElementById("autoSyncInterval");
    const btnAutoToggle = document.getElementById("btnAutoToggle");
    const btnAutoRun = document.getElementById("btnAutoRun");
    const syncMode = document.getElementById("syncMode");
    const statusPollHandle = { id: null };

    async function call(url, method = "GET", body) {
      const resp = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || ("HTTP " + resp.status));
      return json;
    }

    function currentEndpointInputs() {
      return {
        accountId: document.getElementById("accountId").value.trim(),
        days: Number(document.getElementById("days").value || "${YTD_DAYS}"),
        symbol: endpointSymbol.value.trim(),
        conids: endpointConids.value.trim(),
      };
    }

    async function loadEndpointCatalog() {
      const params = currentEndpointInputs();
      const query = new URLSearchParams({
        accountId: params.accountId,
        days: String(params.days || "${YTD_DAYS}"),
        symbol: params.symbol || "AAPL",
        conids: params.conids || "265598",
      });
      const data = await call("/api/debug/endpoints?" + query.toString());
      const selected = endpointSelect.value;
      endpointSelect.innerHTML = "";
      for (const item of data.endpoints || []) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.label + "  [" + item.method + "]  " + item.url;
        endpointSelect.appendChild(option);
      }
      if (selected && [...endpointSelect.options].some((opt) => opt.value === selected)) {
        endpointSelect.value = selected;
      }
    }

    async function fetchSelectedEndpoint() {
      const endpointId = endpointSelect.value;
      if (!endpointId) return;
      const params = currentEndpointInputs();
      const data = await call("/api/debug/fetch", "POST", {
        endpointId,
        accountId: params.accountId,
        days: params.days,
        symbol: params.symbol,
        conids: params.conids,
      });
      endpointOutput.textContent = JSON.stringify(data, null, 2);
    }

    function setStates(status) {
      gatewayState.textContent = status.gateway_running ? "running" : "stopped";
      gatewayState.className = status.gateway_running ? "ok" : "bad";
      const ok = status.authenticated && status.connected;
      authState.textContent = ok ? "authenticated + connected" : "not ready";
      authState.className = ok ? "ok" : "bad";
      btnFetch.disabled = !ok;
      btnFetchHistory.disabled = !ok;
      btnFetchUnderlyings.disabled = !ok;
      btnSync.disabled = !ok;
      btnClearResync.disabled = !ok;
      btnAutoRun.disabled = !ok;
      btnEndpointFetch.disabled = !ok;

      const auto = status.auto_sync || {};
      autoSyncState.textContent = auto.enabled ? "on" : "off";
      autoSyncState.className = auto.enabled ? "ok" : "bad";
      btnAutoToggle.textContent = auto.enabled ? "Disable Auto Sync" : "Enable Auto Sync";
      autoSyncInterval.value = String(auto.intervalSeconds || autoSyncInterval.value);
      const lastSuccess = auto.lastSuccessAt ? new Date(auto.lastSuccessAt).toLocaleTimeString() : "—";
      autoSyncHeartbeat.textContent = auto.inFlight ? "running..." : lastSuccess;
      autoSyncMeta.textContent =
        auto.lastError
          ? ("Error: " + auto.lastError)
          : ("Account " + (auto.accountId || "—") + " · Days " + (auto.days || "—") + " · Last attempt " + (auto.lastAttemptAt ? new Date(auto.lastAttemptAt).toLocaleTimeString() : "—"));
      if (typeof auto.syncMode === "string") {
        syncMode.value = auto.syncMode;
      }
    }

    async function refreshStatus() {
      try {
        const status = await call("/api/ibkr/auth-status");
        setStates(status);
      } catch (e) {
        gatewayState.textContent = "error";
        gatewayState.className = "bad";
        authState.textContent = String(e.message || e);
        authState.className = "bad";
        btnFetch.disabled = true;
        btnFetchHistory.disabled = true;
        btnFetchUnderlyings.disabled = true;
        btnSync.disabled = true;
        btnClearResync.disabled = true;
        btnAutoRun.disabled = true;
        btnAutoToggle.disabled = true;
        btnEndpointFetch.disabled = true;
      }
      try {
        const logs = await call("/api/logs");
        logOutput.textContent = (logs.logs || []).join("\\n") || "—";
      } catch {
        logOutput.textContent = "failed to load logs";
      }
    }

    document.getElementById("btnStart").onclick = async () => {
      try { await call("/api/gateway/start", "POST"); } catch (e) { alert(String(e.message || e)); }
      await refreshStatus();
    };

    document.getElementById("btnStop").onclick = async () => {
      try {
        if (statusPollHandle.id) {
          clearInterval(statusPollHandle.id);
          statusPollHandle.id = null;
        }
        await call("/api/gateway/stop", "POST");
        gatewayState.textContent = "stopping";
        gatewayState.className = "bad";
        authState.textContent = "panel shutting down";
        authState.className = "bad";
        btnFetch.disabled = true;
        btnFetchHistory.disabled = true;
        btnFetchUnderlyings.disabled = true;
        btnSync.disabled = true;
        btnClearResync.disabled = true;
        btnAutoRun.disabled = true;
        btnAutoToggle.disabled = true;
        btnEndpointFetch.disabled = true;
        autoSyncMeta.textContent = "Stopping panel and CPGW...";
      } catch (e) {
        alert(String(e.message || e));
      }
    };

    document.getElementById("btnCheck").onclick = refreshStatus;

    document.getElementById("btnFetch").onclick = async () => {
      const accountId = document.getElementById("accountId").value.trim();
      try {
        const data = await call("/api/fetch/preview", "POST", {
          accountId,
          includeTrades: false
        });
        syncMode.value = "live";
        previewOutput.textContent = JSON.stringify(data.preview, null, 2);
        previewMeta.textContent = "Live preview ready: " + data.preview.positions.length + " positions, " + data.preview.trades.length + " trades.";
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnFetchHistory.onclick = async () => {
      const accountId = document.getElementById("accountId").value.trim();
      const days = Number(document.getElementById("days").value || "${YTD_DAYS}");
      try {
        const data = await call("/api/fetch/preview", "POST", {
          accountId,
          days,
          includeTrades: true
        });
        syncMode.value = "history";
        previewOutput.textContent = JSON.stringify(data.preview, null, 2);
        previewMeta.textContent = "History preview ready: " + data.preview.positions.length + " positions, " + data.preview.trades.length + " trades.";
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnFetchUnderlyings.onclick = async () => {
      const accountId = document.getElementById("accountId").value.trim();
      try {
        const data = await call("/api/fetch/underlyings", "POST", {
          accountId
        });
        previewOutput.textContent = JSON.stringify(data, null, 2);
        const count = Object.keys(data.underlyings || {}).length;
        previewMeta.textContent = "Underlying prices fetched: " + count + " tickers.";
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    document.getElementById("btnSync").onclick = async () => {
      try {
        const mode = syncMode.value === "history" ? "history" : "live";
        const data = await call("/api/sync", "POST", {
          accountId: document.getElementById("accountId").value.trim(),
          days: Number(document.getElementById("days").value || "${YTD_DAYS}"),
          includeTrades: mode === "history",
          syncMode: mode
        });
        if (data.preview) {
          previewOutput.textContent = JSON.stringify(data.preview, null, 2);
          previewMeta.textContent =
            (mode === "history" ? "History" : "Live") +
            " sync complete: " +
            data.preview.positions.length +
            " positions, " +
            data.preview.trades.length +
            " trades.";
        }
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnClearResync.onclick = async () => {
      const confirmed = window.confirm(
        "This will clear only IBKR snapshots in app DB, then fetch full history and sync again. Continue?",
      );
      if (!confirmed) return;
      try {
        const data = await call("/api/clear-resync", "POST", {
          accountId: document.getElementById("accountId").value.trim(),
          days: Number(document.getElementById("days").value || "${YTD_DAYS}")
        });
        syncMode.value = "history";
        if (data.preview) {
          previewOutput.textContent = JSON.stringify(data.preview, null, 2);
          previewMeta.textContent =
            "Clear + full resync complete: " +
            data.preview.positions.length +
            " positions, " +
            data.preview.trades.length +
            " trades.";
        }
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnAutoToggle.onclick = async () => {
      try {
        const enabled = autoSyncState.textContent !== "on";
        await call("/api/auto-sync", "POST", {
          enabled,
          intervalSeconds: Number(autoSyncInterval.value || "60"),
          accountId: document.getElementById("accountId").value.trim(),
          days: Number(document.getElementById("days").value || "${YTD_DAYS}")
        });
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    autoSyncInterval.onchange = async () => {
      try {
        await call("/api/auto-sync", "POST", {
          intervalSeconds: Number(autoSyncInterval.value || "60"),
          accountId: document.getElementById("accountId").value.trim(),
          days: Number(document.getElementById("days").value || "${YTD_DAYS}")
        });
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnAutoRun.onclick = async () => {
      try {
        await call("/api/auto-sync/run", "POST", {
          accountId: document.getElementById("accountId").value.trim(),
          days: Number(document.getElementById("days").value || "${YTD_DAYS}")
        });
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    btnEndpointFetch.onclick = async () => {
      try {
        await fetchSelectedEndpoint();
      } catch (e) {
        alert(String(e.message || e));
      }
    };

    document.getElementById("accountId").onchange = async () => {
      try { await loadEndpointCatalog(); } catch {}
    };
    document.getElementById("days").onchange = async () => {
      try { await loadEndpointCatalog(); } catch {}
    };
    endpointSymbol.onchange = async () => {
      try { await loadEndpointCatalog(); } catch {}
    };
    endpointConids.onchange = async () => {
      try { await loadEndpointCatalog(); } catch {}
    };

    refreshStatus();
    loadEndpointCatalog().catch(() => {
      endpointOutput.textContent = "Failed to load endpoint catalog.";
    });
    statusPollHandle.id = setInterval(refreshStatus, 7000);
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PANEL_PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/logs") {
    sendJson(res, 200, { logs: state.logs.slice(-120) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ibkr/auth-status") {
    const status = await fetchAuthStatus();
    sendJson(res, 200, {
      ...status,
      auto_sync: {
        enabled: state.autoSync.enabled,
        intervalSeconds: state.autoSync.intervalSeconds,
        inFlight: state.autoSync.inFlight,
        lastAttemptAt: state.autoSync.lastAttemptAt,
        lastSuccessAt: state.autoSync.lastSuccessAt,
        lastError: state.autoSync.lastError,
        accountId: state.preferences.accountId,
        days: state.preferences.days,
        syncMode: state.preferences.syncMode,
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/debug/endpoints") {
    const accountId = String(url.searchParams.get("accountId") ?? state.preferences.accountId).trim();
    const days = Number(url.searchParams.get("days") ?? state.preferences.days);
    const symbol = String(url.searchParams.get("symbol") ?? "AAPL").trim();
    const conids = String(url.searchParams.get("conids") ?? "265598").trim();
    const endpoints = listEndpointSpecs(accountId, days, symbol, conids);
    sendJson(res, 200, {
      ok: true,
      accountId,
      days: Number.isFinite(days) ? Math.max(1, Math.min(3650, Math.floor(days))) : state.preferences.days,
      endpoints,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/debug/fetch") {
    try {
      const body = await readBody(req);
      const endpoint = resolveEndpointSpec(
        String(body.endpointId ?? ""),
        body.accountId ?? state.preferences.accountId,
        body.days ?? state.preferences.days,
        body.symbol ?? "AAPL",
        body.conids ?? "265598",
      );
      if (!endpoint) {
        sendJson(res, 400, { error: "Unknown endpointId." });
        return;
      }
      const response = await fetchJson(endpoint.url, { method: endpoint.method });
      pushLog(`Debug fetch: ${endpoint.id} (${response.status})`);
      sendJson(res, 200, {
        ok: response.ok,
        endpoint,
        status: response.status,
        error: response.error,
        data: response.data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Endpoint fetch failed";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gateway/start") {
    const result = startGateway();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gateway/stop") {
    const result = stopGateway();
    sendJson(res, 200, { ...result, panel_shutting_down: true });
    setTimeout(() => {
      shutdownPanelProcess();
    }, 150);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/fetch/preview") {
    try {
      const body = await readBody(req);
      if (typeof body.syncMode === "string") {
        state.preferences.syncMode = body.syncMode === "history" ? "history" : "live";
      } else if (typeof body.includeTrades === "boolean") {
        state.preferences.syncMode = body.includeTrades ? "history" : "live";
      }
      const preview = await buildPreview(body.accountId, body.days, {
        includeTrades: body.includeTrades !== false,
      });
      sendJson(res, 200, { ok: true, preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch preview";
      pushLog(`Preview error: ${message}`);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/fetch/underlyings") {
    try {
      const body = await readBody(req);
      const preview = await buildPreview(body.accountId, body.days, {
        includeTrades: false,
        includeUnderlyings: true,
      });
      const underlyings =
        preview.summary && typeof preview.summary.__underlying_prices === "object"
          ? preview.summary.__underlying_prices
          : {};
      sendJson(res, 200, {
        ok: true,
        account_id: preview.account_id,
        fetched_at: preview.fetched_at,
        underlyings,
        notes: preview.notes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch underlying prices";
      pushLog(`Underlying fetch error: ${message}`);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    try {
      const body = await readBody(req);
      const includeTrades = body.includeTrades === true;
      state.preferences.syncMode = includeTrades ? "history" : "live";
      const preview = await buildPreview(body.accountId, body.days, {
        includeTrades,
      });
      const response = await syncPreview(preview, body);
      pushLog("Sync completed successfully.");
      sendJson(res, 200, { ok: true, preview, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      pushLog(`Sync error: ${message}`);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/clear-resync") {
    try {
      const body = await readBody(req);
      state.preferences.syncMode = "history";
      const clearResponse = await clearRemoteIbkrDb(body);
      pushLog(`Remote IBKR DB cleared (${clearResponse.removed ?? "?"} rows).`);
      const preview = await buildPreview(body.accountId, body.days, {
        includeTrades: true,
      });
      const response = await syncPreview(preview, body);
      pushLog("Full history resync completed.");
      sendJson(res, 200, { ok: true, clearResponse, preview, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clear+resync failed";
      pushLog(`Clear+resync error: ${message}`);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auto-sync") {
    try {
      const body = await readBody(req);
      const nextInterval = Number(body.intervalSeconds);
      if (Number.isFinite(nextInterval)) {
        const rounded = Math.floor(nextInterval);
        if (!AUTO_SYNC_CHOICES.includes(rounded)) {
          sendJson(res, 400, { error: `intervalSeconds must be one of: ${AUTO_SYNC_CHOICES.join(", ")}` });
          return;
        }
        state.autoSync.intervalSeconds = rounded;
      }

      if (typeof body.accountId === "string" && body.accountId.trim()) {
        state.preferences.accountId = body.accountId.trim().toUpperCase();
      }
      const days = Number(body.days);
      if (Number.isFinite(days)) {
        state.preferences.days = Math.max(1, Math.min(3650, Math.floor(days)));
      }

      if (typeof body.enabled === "boolean") {
        setAutoSyncEnabled(body.enabled);
      } else if (state.autoSync.enabled) {
        // Re-arm timer if interval changed while enabled.
        setAutoSyncEnabled(true);
      }

      sendJson(res, 200, {
        ok: true,
        auto_sync: {
          enabled: state.autoSync.enabled,
          intervalSeconds: state.autoSync.intervalSeconds,
          accountId: state.preferences.accountId,
          days: state.preferences.days,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update auto-sync";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auto-sync/run") {
    try {
      const body = await readBody(req);
      if (typeof body.accountId === "string" && body.accountId.trim()) {
        state.preferences.accountId = body.accountId.trim().toUpperCase();
      }
      const days = Number(body.days);
      if (Number.isFinite(days)) {
        state.preferences.days = Math.max(1, Math.min(3650, Math.floor(days)));
      }
      await runAutoSyncCycle(true);
      sendJson(res, 200, {
        ok: true,
        lastSuccessAt: state.autoSync.lastSuccessAt,
        lastError: state.autoSync.lastError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auto-sync run failed";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

server.listen(PANEL_PORT, () => {
  const url = `http://localhost:${PANEL_PORT}`;
  pushLog(`Panel listening on ${url}`);
  if (DEFAULT_AUTO_SYNC_ENABLED) {
    setAutoSyncEnabled(true);
  }
  console.log(`IBKR control panel running at ${url}`);
  console.log(`Open panel: ${terminalHyperlink(url)}`);
  if (PANEL_AUTO_OPEN) {
    openBrowser(url);
    console.log("Browser auto-open enabled (IBKR_PANEL_AUTO_OPEN=1).");
  }
});
