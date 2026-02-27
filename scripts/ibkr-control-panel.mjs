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

const state = {
  gatewayProcess: null,
  preview: null,
  lastSyncResponse: null,
  logs: [],
};

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
  }
  return null;
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
      if (v && typeof v === "object" && "value" in v) {
        out[k] = v.value;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  return {};
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
    stdio: ["ignore", "pipe", "pipe"],
  });
  state.gatewayProcess = proc;
  pushLog(`Starting CPGW: ${CPGW_RUN_SH} ${confArg}`);

  proc.stdout?.on("data", (chunk) => pushLog(`[cpgw] ${String(chunk).trim()}`));
  proc.stderr?.on("data", (chunk) => pushLog(`[cpgw:err] ${String(chunk).trim()}`));
  proc.on("close", (code) => {
    pushLog(`CPGW exited (code=${code ?? "null"})`);
  });

  return { ok: true, message: "Gateway start command sent." };
}

function stopGateway() {
  if (!gatewayRunning()) {
    return { ok: true, message: "Gateway is not running." };
  }
  state.gatewayProcess.kill("SIGTERM");
  return { ok: true, message: "Gateway stop signal sent." };
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

async function buildPreview(accountIdInput, daysInput) {
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

  let positionsResp = await fetchJson(`${CPGW_BASE}/portfolio2/${encodeURIComponent(accountId)}/positions`);
  if (!positionsResp.ok || !Array.isArray(positionsResp.data)) {
    positionsResp = await fetchJson(`${CPGW_BASE}/portfolio2/${encodeURIComponent(accountId)}/positions/0`);
  }
  if (!positionsResp.ok || !Array.isArray(positionsResp.data)) {
    positionsResp = await fetchJson(`${CPGW_BASE}/portfolio/${encodeURIComponent(accountId)}/positions/0`);
  }

  const days = Number.isFinite(Number(daysInput)) ? Math.max(1, Math.min(90, Number(daysInput))) : 7;
  const tradesResp = await fetchJson(`${CPGW_BASE}/iserver/account/trades?days=${days}`);

  if (!summaryResp.ok) notes.push(`Summary request failed (${summaryResp.status}).`);
  if (!positionsResp.ok) notes.push(`Positions request failed (${positionsResp.status}).`);
  if (!tradesResp.ok) notes.push(`Trades request failed (${tradesResp.status}).`);

  const preview = {
    account_id: accountId,
    source: "cpgw-local",
    fetched_at: nowIso(),
    summary: normalizeSummary(summaryResp.data),
    positions: normalizePositions(positionsResp.data),
    trades: normalizeTrades(tradesResp.data),
    notes,
    meta: {
      accounts,
      endpoints: {
        summary: `${CPGW_BASE}/portfolio/${accountId}/summary`,
        positions: "portfolio2/positions fallback chain",
        trades: `${CPGW_BASE}/iserver/account/trades?days=${days}`,
      },
    },
  };

  state.preview = preview;
  pushLog(`Preview fetched: ${preview.positions.length} positions, ${preview.trades.length} trades.`);
  return preview;
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
        <label class="muted">Trades Days</label>
        <input id="days" class="input mono" value="7" />
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn green" id="btnFetch">Fetch Preview</button>
        <button class="btn green" id="btnSync">Sync To DB</button>
        <span class="muted">Fetch and sync are separated. Sync uses current preview only.</span>
      </div>
      <div id="previewMeta" class="muted" style="margin-top:8px;">No preview loaded.</div>
    </div>

    <div class="card">
      <div class="mono" style="margin-bottom:6px;">Preview JSON</div>
      <pre id="previewOutput">—</pre>
    </div>

    <div class="card">
      <div class="mono" style="margin-bottom:6px;">Sync Response</div>
      <pre id="syncOutput">—</pre>
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
    const syncOutput = document.getElementById("syncOutput");
    const previewMeta = document.getElementById("previewMeta");
    const logOutput = document.getElementById("logOutput");
    const btnFetch = document.getElementById("btnFetch");
    const btnSync = document.getElementById("btnSync");

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

    function setStates(status) {
      gatewayState.textContent = status.gateway_running ? "running" : "stopped";
      gatewayState.className = status.gateway_running ? "ok" : "bad";
      const ok = status.authenticated && status.connected;
      authState.textContent = ok ? "authenticated + connected" : "not ready";
      authState.className = ok ? "ok" : "bad";
      btnFetch.disabled = !ok;
      btnSync.disabled = !ok;
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
        btnSync.disabled = true;
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
      try { await call("/api/gateway/stop", "POST"); } catch (e) { alert(String(e.message || e)); }
      await refreshStatus();
    };

    document.getElementById("btnCheck").onclick = refreshStatus;

    document.getElementById("btnFetch").onclick = async () => {
      const accountId = document.getElementById("accountId").value.trim();
      const days = Number(document.getElementById("days").value || "7");
      try {
        const data = await call("/api/fetch/preview", "POST", { accountId, days });
        previewOutput.textContent = JSON.stringify(data.preview, null, 2);
        previewMeta.textContent = "Preview ready: " + data.preview.positions.length + " positions, " + data.preview.trades.length + " trades.";
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    document.getElementById("btnSync").onclick = async () => {
      try {
        const data = await call("/api/sync", "POST");
        syncOutput.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        alert(String(e.message || e));
      }
      await refreshStatus();
    };

    refreshStatus();
    setInterval(refreshStatus, 7000);
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
    sendJson(res, 200, status);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gateway/start") {
    const result = startGateway();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gateway/stop") {
    const result = stopGateway();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/fetch/preview") {
    try {
      const body = await readBody(req);
      const preview = await buildPreview(body.accountId, body.days);
      sendJson(res, 200, { ok: true, preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch preview";
      pushLog(`Preview error: ${message}`);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    try {
      if (!state.preview) {
        sendJson(res, 400, { error: "No preview loaded. Fetch preview first." });
        return;
      }

      const body = await readBody(req);
      const appSyncUrl = String(body.appSyncUrl ?? APP_SYNC_URL).trim();
      const token = String(body.token ?? APP_SYNC_TOKEN).trim();
      if (!appSyncUrl) {
        sendJson(res, 400, { error: "IBKR_APP_SYNC_URL is not configured." });
        return;
      }
      if (!token) {
        sendJson(res, 400, { error: "IBKR_SYNC_TOKEN is not configured." });
        return;
      }

      const resp = await fetchJson(appSyncUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ibkr-sync-token": token,
        },
        body: JSON.stringify(state.preview),
      });

      if (!resp.ok) {
        const message = typeof resp.data?.error === "string" ? resp.data.error : `Sync failed (${resp.status})`;
        sendJson(res, 502, { error: message, upstream: resp.data });
        return;
      }

      state.lastSyncResponse = resp.data;
      pushLog("Sync completed successfully.");
      sendJson(res, 200, { ok: true, response: resp.data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      pushLog(`Sync error: ${message}`);
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
  console.log(`IBKR control panel running at ${url}`);
  console.log(`Open panel: ${terminalHyperlink(url)}`);
  if (PANEL_AUTO_OPEN) {
    openBrowser(url);
    console.log("Browser auto-open enabled (IBKR_PANEL_AUTO_OPEN=1).");
  }
});
