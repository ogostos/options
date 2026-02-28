import { sql } from "@vercel/postgres";

import {
  SEED_ACCOUNT,
  SEED_RULES,
  SEED_SETTINGS,
  SEED_STOCK_POSITIONS,
  SEED_TRADES,
} from "@/lib/seed-data";
import type {
  AccountSnapshot,
  DashboardSettings,
  IbkrSyncPayload,
  IbkrSyncSnapshot,
  JournalEntry,
  Rule,
  StockPosition,
  Trade,
  TradeInput,
} from "@/lib/types";

let initPromise: Promise<void> | null = null;

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "t" || value === "1";
  if (typeof value === "number") return value !== 0;
  return false;
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "");
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toISOString().slice(0, 10);
}

function mapTradeRow(row: Record<string, unknown>): Trade {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    ticker: String(row.ticker),
    strategy: String(row.strategy),
    legs: String(row.legs),
    direction: String(row.direction) as Trade["direction"],
    entry_date: toDateOnly(row.entry_date),
    exit_date: row.exit_date ? toDateOnly(row.exit_date) : null,
    expiry_date: row.expiry_date ? toDateOnly(row.expiry_date) : null,
    status: String(row.status) as Trade["status"],
    position_type: String(row.position_type) as Trade["position_type"],
    cost_basis: toNum(row.cost_basis),
    max_risk: toNum(row.max_risk),
    max_profit: row.max_profit == null ? null : toNum(row.max_profit),
    realized_pl: row.realized_pl == null ? null : toNum(row.realized_pl),
    unrealized_pl: row.unrealized_pl == null ? null : toNum(row.unrealized_pl),
    return_pct: row.return_pct == null ? null : toNum(row.return_pct),
    commissions: toNum(row.commissions),
    contracts: Number(row.contracts ?? 1),
    catalyst: String(row.catalyst) as Trade["catalyst"],
    notes: String(row.notes ?? ""),
    lesson: String(row.lesson ?? ""),
    breakeven: row.breakeven == null ? null : toNum(row.breakeven),
    stop_loss: row.stop_loss == null ? null : toNum(row.stop_loss),
    strike_long: row.strike_long == null ? null : toNum(row.strike_long),
    strike_short: row.strike_short == null ? null : toNum(row.strike_short),
    close_price_long: row.close_price_long == null ? null : toNum(row.close_price_long),
    close_price_short: row.close_price_short == null ? null : toNum(row.close_price_short),
    theta_per_day: row.theta_per_day == null ? null : toNum(row.theta_per_day),
    urgency: row.urgency == null ? null : Number(row.urgency),
    peak_window: String(row.peak_window ?? ""),
    hold_advice: String(row.hold_advice ?? ""),
    exit_trigger: String(row.exit_trigger ?? ""),
    best_case: String(row.best_case ?? ""),
    exit_conservative: String(row.exit_conservative ?? ""),
    exit_balanced: String(row.exit_balanced ?? ""),
    exit_aggressive: String(row.exit_aggressive ?? ""),
    source: String(row.source ?? "manual") as Trade["source"],
    ib_symbols: Array.isArray(row.ib_symbols)
      ? (row.ib_symbols as string[])
      : typeof row.ib_symbols === "string"
        ? (JSON.parse(row.ib_symbols) as string[])
        : [],
  };
}

function mapAccountRow(row: Record<string, unknown>): AccountSnapshot {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    period_start: toDateOnly(row.period_start),
    period_end: toDateOnly(row.period_end),
    start_nav: toNum(row.start_nav),
    end_nav: toNum(row.end_nav),
    twr: toNum(row.twr),
    cash_start: toNum(row.cash_start),
    cash_end: toNum(row.cash_end),
    cash_settled: toNum(row.cash_settled),
    stock_long: toNum(row.stock_long),
    stock_short: toNum(row.stock_short),
    stock_total: toNum(row.stock_total),
    options_long: toNum(row.options_long),
    options_short: toNum(row.options_short),
    options_total: toNum(row.options_total),
    interest_accrued: toNum(row.interest_accrued),
    interest_rate_est: toNum(row.interest_rate_est),
    commissions_total: toNum(row.commissions_total),
    margin_debt: toNum(row.margin_debt),
    mtm: row.mtm == null ? null : toNum(row.mtm),
    trades_sales: row.trades_sales == null ? null : toNum(row.trades_sales),
    trades_purchase: row.trades_purchase == null ? null : toNum(row.trades_purchase),
  };
}

function mapRuleRow(row: Record<string, unknown>): Rule {
  return {
    id: Number(row.id),
    rule_number: Number(row.rule_number),
    title: String(row.title),
    description: String(row.description),
    severity: String(row.severity) as Rule["severity"],
    enabled: toBool(row.enabled),
  };
}

function mapStockRow(row: Record<string, unknown>): StockPosition {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    ticker: String(row.ticker),
    shares: toNum(row.shares),
    cost_basis: toNum(row.cost_basis),
    cost_price: toNum(row.cost_price),
    close_price: toNum(row.close_price),
    unrealized_pl: toNum(row.unrealized_pl),
    notes: String(row.notes ?? ""),
  };
}

function mapJournalRow(row: Record<string, unknown>): JournalEntry {
  return {
    id: Number(row.id),
    trade_id: Number(row.trade_id),
    created_at: String(row.created_at),
    type: String(row.type) as JournalEntry["type"],
    thesis: String(row.thesis),
    emotional_state: String(row.emotional_state),
    plan_adherence_score: Number(row.plan_adherence_score),
    notes: String(row.notes ?? ""),
  };
}

function mapSettingsRow(row: Record<string, unknown>): DashboardSettings {
  return {
    id: Number(row.id),
    account_name: String(row.account_name),
    account_id: String(row.account_id),
    account_type: String(row.account_type),
    interest_rate_est: toNum(row.interest_rate_est),
    price_api: String(row.price_api) as DashboardSettings["price_api"],
    alpha_vantage_key: String(row.alpha_vantage_key ?? ""),
  };
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") {
    return value as T;
  }
  return fallback;
}

function mapIbkrSnapshotRow(row: Record<string, unknown>): IbkrSyncSnapshot {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    account_id: String(row.account_id),
    source: String(row.source ?? "cpgw-local"),
    fetched_at: String(row.fetched_at),
    summary: parseJsonValue<Record<string, unknown>>(row.summary, {}),
    positions: parseJsonValue<IbkrSyncSnapshot["positions"]>(row.positions, []),
    trades: parseJsonValue<IbkrSyncSnapshot["trades"]>(row.trades, []),
    notes: parseJsonValue<string[]>(row.notes, []),
  };
}

function hasSymbolOverlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  return b.some((item) => set.has(item));
}

function sortUniqueSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))].sort();
}

function numbersAlmostEqual(a: number | null | undefined, b: number | null | undefined, tolerance = 0.01) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function textEqual(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim() === (b ?? "").trim();
}

function tradeMatchesImportPayload(existing: Trade, incoming: TradeInput) {
  const incomingSymbols = sortUniqueSymbols(incoming.ib_symbols ?? []);
  const existingSymbols = sortUniqueSymbols(existing.ib_symbols);

  return (
    existing.ticker === incoming.ticker.toUpperCase() &&
    existing.entry_date === incoming.entry_date &&
    existing.status === incoming.status &&
    textEqual(existing.strategy, incoming.strategy) &&
    textEqual(existing.legs, incoming.legs) &&
    existing.direction === incoming.direction &&
    textEqual(existing.exit_date, incoming.exit_date ?? null) &&
    textEqual(existing.expiry_date, incoming.expiry_date ?? null) &&
    numbersAlmostEqual(existing.cost_basis, incoming.cost_basis) &&
    numbersAlmostEqual(existing.max_risk, incoming.max_risk) &&
    numbersAlmostEqual(existing.max_profit, incoming.max_profit ?? null) &&
    numbersAlmostEqual(existing.realized_pl, incoming.realized_pl ?? null) &&
    numbersAlmostEqual(existing.unrealized_pl, incoming.unrealized_pl ?? null) &&
    numbersAlmostEqual(existing.return_pct, incoming.return_pct ?? null) &&
    numbersAlmostEqual(existing.commissions, incoming.commissions ?? 0) &&
    existing.contracts === (incoming.contracts ?? 1) &&
    numbersAlmostEqual(existing.breakeven, incoming.breakeven ?? null) &&
    numbersAlmostEqual(existing.strike_long, incoming.strike_long ?? null) &&
    numbersAlmostEqual(existing.strike_short, incoming.strike_short ?? null) &&
    numbersAlmostEqual(existing.close_price_long, incoming.close_price_long ?? null) &&
    numbersAlmostEqual(existing.close_price_short, incoming.close_price_short ?? null) &&
    existingSymbols.join("|") === incomingSymbols.join("|")
  );
}

function buildImportUpdatePayload(existing: Trade, incoming: TradeInput): Partial<TradeInput> {
  const mergedSymbols = sortUniqueSymbols([...(existing.ib_symbols ?? []), ...(incoming.ib_symbols ?? [])]);

  return {
    ticker: incoming.ticker.toUpperCase(),
    strategy: incoming.strategy || existing.strategy,
    legs: incoming.legs || existing.legs,
    direction: incoming.direction || existing.direction,
    entry_date: incoming.entry_date || existing.entry_date,
    exit_date: incoming.exit_date ?? existing.exit_date,
    expiry_date: incoming.expiry_date ?? existing.expiry_date,
    status: incoming.status ?? existing.status,
    position_type: existing.position_type,
    cost_basis: incoming.cost_basis ?? existing.cost_basis,
    max_risk: incoming.max_risk ?? existing.max_risk,
    max_profit: incoming.max_profit ?? existing.max_profit,
    realized_pl: incoming.realized_pl ?? existing.realized_pl,
    unrealized_pl: incoming.unrealized_pl ?? existing.unrealized_pl,
    return_pct: incoming.return_pct ?? existing.return_pct,
    commissions: incoming.commissions ?? existing.commissions,
    contracts: incoming.contracts ?? existing.contracts,
    breakeven: incoming.breakeven ?? existing.breakeven,
    strike_long: incoming.strike_long ?? existing.strike_long,
    strike_short: incoming.strike_short ?? existing.strike_short,
    close_price_long: incoming.close_price_long ?? existing.close_price_long,
    close_price_short: incoming.close_price_short ?? existing.close_price_short,
    source: existing.source,
    ib_symbols: mergedSymbols,
  };
}

export async function applyImportPayloadToTradeId(tradeId: number, payload: TradeInput): Promise<Trade> {
  await ensureDb();
  const existing = await getTradeById(tradeId);
  if (!existing) {
    throw new Error(`Trade ${tradeId} not found for import resolution`);
  }

  const updatePayload = buildImportUpdatePayload(existing, payload);
  const updated = await updateTrade(tradeId, updatePayload);
  if (!updated) {
    throw new Error(`Failed to update trade ${tradeId} during import resolution`);
  }
  return updated;
}

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
    throw new Error("DATABASE_URL is not configured. Add Vercel Postgres connection string to run this dashboard.");
  }
}

export async function ensureDb() {
  assertDatabaseConfigured();
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS account_snapshots (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          start_nav NUMERIC(14,2) NOT NULL,
          end_nav NUMERIC(14,2) NOT NULL,
          twr NUMERIC(8,2) NOT NULL,
          cash_start NUMERIC(14,2) NOT NULL,
          cash_end NUMERIC(14,2) NOT NULL,
          cash_settled NUMERIC(14,2) NOT NULL,
          stock_long NUMERIC(14,2) NOT NULL,
          stock_short NUMERIC(14,2) NOT NULL,
          stock_total NUMERIC(14,2) NOT NULL,
          options_long NUMERIC(14,2) NOT NULL,
          options_short NUMERIC(14,2) NOT NULL,
          options_total NUMERIC(14,2) NOT NULL,
          interest_accrued NUMERIC(14,2) NOT NULL,
          interest_rate_est NUMERIC(8,2) NOT NULL,
          commissions_total NUMERIC(14,2) NOT NULL,
          margin_debt NUMERIC(14,2) NOT NULL,
          mtm NUMERIC(14,2),
          trades_sales NUMERIC(14,2),
          trades_purchase NUMERIC(14,2)
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ticker TEXT NOT NULL,
          strategy TEXT NOT NULL,
          legs TEXT NOT NULL,
          direction TEXT NOT NULL,
          entry_date DATE NOT NULL,
          exit_date DATE,
          expiry_date DATE,
          status TEXT NOT NULL,
          position_type TEXT NOT NULL DEFAULT 'option',
          cost_basis NUMERIC(14,2) NOT NULL,
          max_risk NUMERIC(14,2) NOT NULL,
          max_profit NUMERIC(14,2),
          realized_pl NUMERIC(14,2),
          unrealized_pl NUMERIC(14,2),
          return_pct NUMERIC(10,2),
          commissions NUMERIC(14,2) NOT NULL DEFAULT 0,
          contracts INTEGER NOT NULL DEFAULT 1,
          catalyst TEXT NOT NULL DEFAULT 'None',
          notes TEXT NOT NULL DEFAULT '',
          lesson TEXT NOT NULL DEFAULT '',
          breakeven NUMERIC(14,4),
          stop_loss NUMERIC(14,4),
          strike_long NUMERIC(14,4),
          strike_short NUMERIC(14,4),
          close_price_long NUMERIC(14,4),
          close_price_short NUMERIC(14,4),
          theta_per_day NUMERIC(14,4),
          urgency INTEGER,
          peak_window TEXT NOT NULL DEFAULT '',
          hold_advice TEXT NOT NULL DEFAULT '',
          exit_trigger TEXT NOT NULL DEFAULT '',
          best_case TEXT NOT NULL DEFAULT '',
          exit_conservative TEXT NOT NULL DEFAULT '',
          exit_balanced TEXT NOT NULL DEFAULT '',
          exit_aggressive TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'manual',
          ib_symbols JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_trades_ib_symbols ON trades USING GIN(ib_symbols);`;

      await sql`
        CREATE TABLE IF NOT EXISTS rules (
          id SERIAL PRIMARY KEY,
          rule_number INTEGER NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          severity TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS journal_entries (
          id SERIAL PRIMARY KEY,
          trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          type TEXT NOT NULL,
          thesis TEXT NOT NULL,
          emotional_state TEXT NOT NULL,
          plan_adherence_score INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT ''
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          account_name TEXT NOT NULL,
          account_id TEXT NOT NULL,
          account_type TEXT NOT NULL,
          interest_rate_est NUMERIC(8,2) NOT NULL,
          price_api TEXT NOT NULL DEFAULT 'yahoo',
          alpha_vantage_key TEXT NOT NULL DEFAULT ''
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS stock_positions (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ticker TEXT NOT NULL,
          shares NUMERIC(14,4) NOT NULL,
          cost_basis NUMERIC(14,2) NOT NULL,
          cost_price NUMERIC(14,4) NOT NULL,
          close_price NUMERIC(14,4) NOT NULL,
          unrealized_pl NUMERIC(14,2) NOT NULL,
          notes TEXT NOT NULL DEFAULT ''
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ibkr_sync_snapshots (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          account_id TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'cpgw-local',
          fetched_at TIMESTAMPTZ NOT NULL,
          summary JSONB NOT NULL DEFAULT '{}'::jsonb,
          positions JSONB NOT NULL DEFAULT '[]'::jsonb,
          trades JSONB NOT NULL DEFAULT '[]'::jsonb,
          notes JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_ibkr_sync_created_at ON ibkr_sync_snapshots(created_at DESC);`;

      const tradesCountResult = await sql`SELECT COUNT(*)::int AS count FROM trades;`;
      if (Number(tradesCountResult.rows[0]?.count ?? 0) === 0) {
        await seedDatabase();
      }
    })();
  }

  await initPromise;
}

async function seedDatabase() {
  await sql`
    INSERT INTO account_snapshots (
      period_start, period_end, start_nav, end_nav, twr,
      cash_start, cash_end, cash_settled, stock_long, stock_short, stock_total,
      options_long, options_short, options_total, interest_accrued, interest_rate_est,
      commissions_total, margin_debt, mtm, trades_sales, trades_purchase
    ) VALUES (
      ${SEED_ACCOUNT.period_start}, ${SEED_ACCOUNT.period_end}, ${SEED_ACCOUNT.start_nav}, ${SEED_ACCOUNT.end_nav}, ${SEED_ACCOUNT.twr},
      ${SEED_ACCOUNT.cash_start}, ${SEED_ACCOUNT.cash_end}, ${SEED_ACCOUNT.cash_settled}, ${SEED_ACCOUNT.stock_long}, ${SEED_ACCOUNT.stock_short}, ${SEED_ACCOUNT.stock_total},
      ${SEED_ACCOUNT.options_long}, ${SEED_ACCOUNT.options_short}, ${SEED_ACCOUNT.options_total}, ${SEED_ACCOUNT.interest_accrued}, ${SEED_ACCOUNT.interest_rate_est},
      ${SEED_ACCOUNT.commissions_total}, ${SEED_ACCOUNT.margin_debt}, ${SEED_ACCOUNT.mtm}, ${SEED_ACCOUNT.trades_sales}, ${SEED_ACCOUNT.trades_purchase}
    );
  `;

  await sql`
    INSERT INTO settings (account_name, account_id, account_type, interest_rate_est, price_api, alpha_vantage_key)
    VALUES (
      ${SEED_SETTINGS.account_name},
      ${SEED_SETTINGS.account_id},
      ${SEED_SETTINGS.account_type},
      ${SEED_SETTINGS.interest_rate_est},
      ${SEED_SETTINGS.price_api},
      ${SEED_SETTINGS.alpha_vantage_key}
    );
  `;

  for (const stock of SEED_STOCK_POSITIONS) {
    await sql`
      INSERT INTO stock_positions (ticker, shares, cost_basis, cost_price, close_price, unrealized_pl, notes)
      VALUES (${stock.ticker}, ${stock.shares}, ${stock.cost_basis}, ${stock.cost_price}, ${stock.close_price}, ${stock.unrealized_pl}, ${stock.notes});
    `;
  }

  for (const rule of SEED_RULES) {
    await sql`
      INSERT INTO rules (rule_number, title, description, severity, enabled)
      VALUES (${rule.rule_number}, ${rule.title}, ${rule.description}, ${rule.severity}, ${rule.enabled});
    `;
  }

  for (const trade of SEED_TRADES) {
    const result = await sql`
      INSERT INTO trades (
        ticker, strategy, legs, direction,
        entry_date, exit_date, expiry_date,
        status, position_type,
        cost_basis, max_risk, max_profit,
        realized_pl, unrealized_pl, return_pct, commissions, contracts,
        catalyst, notes, lesson,
        breakeven, stop_loss, strike_long, strike_short,
        close_price_long, close_price_short, theta_per_day, urgency,
        peak_window, hold_advice, exit_trigger, best_case,
        exit_conservative, exit_balanced, exit_aggressive,
        source, ib_symbols
      ) VALUES (
        ${trade.ticker.toUpperCase()}, ${trade.strategy}, ${trade.legs}, ${trade.direction},
        ${trade.entry_date}, ${trade.exit_date ?? null}, ${trade.expiry_date ?? null},
        ${trade.status}, ${trade.position_type ?? "option"},
        ${trade.cost_basis}, ${trade.max_risk}, ${trade.max_profit ?? null},
        ${trade.realized_pl ?? null}, ${trade.unrealized_pl ?? null}, ${trade.return_pct ?? null}, ${trade.commissions ?? 0}, ${trade.contracts ?? 1},
        ${trade.catalyst ?? "None"}, ${trade.notes ?? ""}, ${trade.lesson ?? ""},
        ${trade.breakeven ?? null}, ${trade.stop_loss ?? null}, ${trade.strike_long ?? null}, ${trade.strike_short ?? null},
        ${trade.close_price_long ?? null}, ${trade.close_price_short ?? null}, ${trade.theta_per_day ?? null}, ${trade.urgency ?? null},
        ${trade.peak_window ?? ""}, ${trade.hold_advice ?? ""}, ${trade.exit_trigger ?? ""}, ${trade.best_case ?? ""},
        ${trade.exit_conservative ?? ""}, ${trade.exit_balanced ?? ""}, ${trade.exit_aggressive ?? ""},
        ${trade.source ?? "manual"}, ${JSON.stringify(trade.ib_symbols ?? [])}::jsonb
      ) RETURNING id;
    `;

    if (trade.status === "OPEN") {
      await sql`
        INSERT INTO journal_entries (trade_id, type, thesis, emotional_state, plan_adherence_score, notes)
        VALUES (
          ${result.rows[0].id},
          'pre_trade',
          ${trade.notes || "Catalyst-driven trade with defined risk"},
          'Focused',
          4,
          ${trade.hold_advice || "Seed pre-trade journal entry"}
        );
      `;
    }
  }
}

export async function listTrades(filters?: {
  status?: string;
  ticker?: string;
  positionType?: "option" | "stock";
}): Promise<Trade[]> {
  await ensureDb();

  if (filters?.status && filters?.ticker && filters?.positionType) {
    const result = await sql`
      SELECT * FROM trades
      WHERE status = ${filters.status}
        AND ticker = ${filters.ticker.toUpperCase()}
        AND position_type = ${filters.positionType}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.status && filters?.ticker) {
    const result = await sql`
      SELECT * FROM trades
      WHERE status = ${filters.status}
        AND ticker = ${filters.ticker.toUpperCase()}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.status && filters?.positionType) {
    const result = await sql`
      SELECT * FROM trades
      WHERE status = ${filters.status}
        AND position_type = ${filters.positionType}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.ticker && filters?.positionType) {
    const result = await sql`
      SELECT * FROM trades
      WHERE ticker = ${filters.ticker.toUpperCase()}
        AND position_type = ${filters.positionType}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.status) {
    const result = await sql`
      SELECT * FROM trades
      WHERE status = ${filters.status}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.ticker) {
    const result = await sql`
      SELECT * FROM trades
      WHERE ticker = ${filters.ticker.toUpperCase()}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  if (filters?.positionType) {
    const result = await sql`
      SELECT * FROM trades
      WHERE position_type = ${filters.positionType}
      ORDER BY entry_date DESC, created_at DESC;
    `;
    return result.rows.map((row) => mapTradeRow(row));
  }

  const result = await sql`SELECT * FROM trades ORDER BY entry_date DESC, created_at DESC;`;
  return result.rows.map((row) => mapTradeRow(row));
}

export async function getTradeById(id: number): Promise<Trade | null> {
  await ensureDb();
  const result = await sql`SELECT * FROM trades WHERE id = ${id} LIMIT 1;`;
  if (!result.rowCount) return null;
  return mapTradeRow(result.rows[0]);
}

export async function createTrade(payload: TradeInput): Promise<Trade> {
  await ensureDb();

  const result = await sql`
    INSERT INTO trades (
      ticker, strategy, legs, direction,
      entry_date, exit_date, expiry_date,
      status, position_type,
      cost_basis, max_risk, max_profit,
      realized_pl, unrealized_pl, return_pct, commissions, contracts,
      catalyst, notes, lesson,
      breakeven, stop_loss, strike_long, strike_short,
      close_price_long, close_price_short, theta_per_day, urgency,
      peak_window, hold_advice, exit_trigger, best_case,
      exit_conservative, exit_balanced, exit_aggressive,
      source, ib_symbols
    ) VALUES (
      ${payload.ticker.toUpperCase()}, ${payload.strategy}, ${payload.legs}, ${payload.direction},
      ${payload.entry_date}, ${payload.exit_date ?? null}, ${payload.expiry_date ?? null},
      ${payload.status}, ${payload.position_type ?? "option"},
      ${payload.cost_basis}, ${payload.max_risk}, ${payload.max_profit ?? null},
      ${payload.realized_pl ?? null}, ${payload.unrealized_pl ?? null}, ${payload.return_pct ?? null},
      ${payload.commissions ?? 0}, ${payload.contracts ?? 1},
      ${payload.catalyst ?? "None"}, ${payload.notes ?? ""}, ${payload.lesson ?? ""},
      ${payload.breakeven ?? null}, ${payload.stop_loss ?? null}, ${payload.strike_long ?? null}, ${payload.strike_short ?? null},
      ${payload.close_price_long ?? null}, ${payload.close_price_short ?? null}, ${payload.theta_per_day ?? null}, ${payload.urgency ?? null},
      ${payload.peak_window ?? ""}, ${payload.hold_advice ?? ""}, ${payload.exit_trigger ?? ""}, ${payload.best_case ?? ""},
      ${payload.exit_conservative ?? ""}, ${payload.exit_balanced ?? ""}, ${payload.exit_aggressive ?? ""},
      ${payload.source ?? "manual"}, ${JSON.stringify(payload.ib_symbols ?? [])}::jsonb
    ) RETURNING *;
  `;

  return mapTradeRow(result.rows[0]);
}

export async function updateTrade(id: number, payload: Partial<TradeInput>): Promise<Trade | null> {
  await ensureDb();
  const current = await getTradeById(id);
  if (!current) return null;

  const merged: TradeInput = {
    ticker: payload.ticker ?? current.ticker,
    strategy: payload.strategy ?? current.strategy,
    legs: payload.legs ?? current.legs,
    direction: payload.direction ?? current.direction,
    entry_date: payload.entry_date ?? current.entry_date,
    exit_date: payload.exit_date ?? current.exit_date,
    expiry_date: payload.expiry_date ?? current.expiry_date,
    status: payload.status ?? current.status,
    position_type: payload.position_type ?? current.position_type,
    cost_basis: payload.cost_basis ?? current.cost_basis,
    max_risk: payload.max_risk ?? current.max_risk,
    max_profit: payload.max_profit ?? current.max_profit,
    realized_pl: payload.realized_pl ?? current.realized_pl,
    unrealized_pl: payload.unrealized_pl ?? current.unrealized_pl,
    return_pct: payload.return_pct ?? current.return_pct,
    commissions: payload.commissions ?? current.commissions,
    contracts: payload.contracts ?? current.contracts,
    catalyst: payload.catalyst ?? current.catalyst,
    notes: payload.notes ?? current.notes,
    lesson: payload.lesson ?? current.lesson,
    breakeven: payload.breakeven ?? current.breakeven,
    stop_loss: payload.stop_loss ?? current.stop_loss,
    strike_long: payload.strike_long ?? current.strike_long,
    strike_short: payload.strike_short ?? current.strike_short,
    close_price_long: payload.close_price_long ?? current.close_price_long,
    close_price_short: payload.close_price_short ?? current.close_price_short,
    theta_per_day: payload.theta_per_day ?? current.theta_per_day,
    urgency: payload.urgency ?? current.urgency,
    peak_window: payload.peak_window ?? current.peak_window,
    hold_advice: payload.hold_advice ?? current.hold_advice,
    exit_trigger: payload.exit_trigger ?? current.exit_trigger,
    best_case: payload.best_case ?? current.best_case,
    exit_conservative: payload.exit_conservative ?? current.exit_conservative,
    exit_balanced: payload.exit_balanced ?? current.exit_balanced,
    exit_aggressive: payload.exit_aggressive ?? current.exit_aggressive,
    source: payload.source ?? current.source,
    ib_symbols: payload.ib_symbols ?? current.ib_symbols,
  };

  const result = await sql`
    UPDATE trades SET
      updated_at = NOW(),
      ticker = ${merged.ticker.toUpperCase()},
      strategy = ${merged.strategy},
      legs = ${merged.legs},
      direction = ${merged.direction},
      entry_date = ${merged.entry_date},
      exit_date = ${merged.exit_date ?? null},
      expiry_date = ${merged.expiry_date ?? null},
      status = ${merged.status},
      position_type = ${merged.position_type ?? "option"},
      cost_basis = ${merged.cost_basis},
      max_risk = ${merged.max_risk},
      max_profit = ${merged.max_profit ?? null},
      realized_pl = ${merged.realized_pl ?? null},
      unrealized_pl = ${merged.unrealized_pl ?? null},
      return_pct = ${merged.return_pct ?? null},
      commissions = ${merged.commissions ?? 0},
      contracts = ${merged.contracts ?? 1},
      catalyst = ${merged.catalyst ?? "None"},
      notes = ${merged.notes ?? ""},
      lesson = ${merged.lesson ?? ""},
      breakeven = ${merged.breakeven ?? null},
      stop_loss = ${merged.stop_loss ?? null},
      strike_long = ${merged.strike_long ?? null},
      strike_short = ${merged.strike_short ?? null},
      close_price_long = ${merged.close_price_long ?? null},
      close_price_short = ${merged.close_price_short ?? null},
      theta_per_day = ${merged.theta_per_day ?? null},
      urgency = ${merged.urgency ?? null},
      peak_window = ${merged.peak_window ?? ""},
      hold_advice = ${merged.hold_advice ?? ""},
      exit_trigger = ${merged.exit_trigger ?? ""},
      best_case = ${merged.best_case ?? ""},
      exit_conservative = ${merged.exit_conservative ?? ""},
      exit_balanced = ${merged.exit_balanced ?? ""},
      exit_aggressive = ${merged.exit_aggressive ?? ""},
      source = ${merged.source ?? "manual"},
      ib_symbols = ${JSON.stringify(merged.ib_symbols ?? [])}::jsonb
    WHERE id = ${id}
    RETURNING *;
  `;

  return result.rowCount ? mapTradeRow(result.rows[0]) : null;
}

export async function upsertTradeByImportMatch(payload: TradeInput): Promise<{ trade: Trade; action: "created" | "updated" | "unchanged" }> {
  await ensureDb();

  const existing = await listTrades();
  const match = existing.find((trade) => {
    if (trade.entry_date !== payload.entry_date) return false;
    if (hasSymbolOverlap(trade.ib_symbols, payload.ib_symbols ?? [])) return true;
    return trade.ticker === payload.ticker.toUpperCase();
  });

  if (match) {
    const existingClosed = match.status !== "OPEN";
    const incomingClosed = payload.status !== "OPEN";

    if (existingClosed && incomingClosed && tradeMatchesImportPayload(match, payload)) {
      return { trade: match, action: "unchanged" };
    }

    const updated = await applyImportPayloadToTradeId(match.id, payload);
    return { trade: updated, action: "updated" };
  }

  const created = await createTrade(payload);
  return { trade: created, action: "created" };
}

export async function getLatestAccountSnapshot(): Promise<AccountSnapshot | null> {
  await ensureDb();
  const result = await sql`SELECT * FROM account_snapshots ORDER BY period_end DESC, created_at DESC LIMIT 1;`;
  if (!result.rowCount) return null;
  return mapAccountRow(result.rows[0]);
}

export async function replaceAccountSnapshot(payload: Partial<AccountSnapshot>): Promise<AccountSnapshot> {
  await ensureDb();
  await sql`DELETE FROM account_snapshots;`;
  const result = await sql`
    INSERT INTO account_snapshots (
      period_start, period_end, start_nav, end_nav, twr,
      cash_start, cash_end, cash_settled,
      stock_long, stock_short, stock_total,
      options_long, options_short, options_total,
      interest_accrued, interest_rate_est,
      commissions_total, margin_debt, mtm, trades_sales, trades_purchase
    ) VALUES (
      ${payload.period_start ?? SEED_ACCOUNT.period_start},
      ${payload.period_end ?? SEED_ACCOUNT.period_end},
      ${payload.start_nav ?? SEED_ACCOUNT.start_nav},
      ${payload.end_nav ?? SEED_ACCOUNT.end_nav},
      ${payload.twr ?? SEED_ACCOUNT.twr},
      ${payload.cash_start ?? SEED_ACCOUNT.cash_start},
      ${payload.cash_end ?? SEED_ACCOUNT.cash_end},
      ${payload.cash_settled ?? SEED_ACCOUNT.cash_settled},
      ${payload.stock_long ?? SEED_ACCOUNT.stock_long},
      ${payload.stock_short ?? SEED_ACCOUNT.stock_short},
      ${payload.stock_total ?? SEED_ACCOUNT.stock_total},
      ${payload.options_long ?? SEED_ACCOUNT.options_long},
      ${payload.options_short ?? SEED_ACCOUNT.options_short},
      ${payload.options_total ?? SEED_ACCOUNT.options_total},
      ${payload.interest_accrued ?? SEED_ACCOUNT.interest_accrued},
      ${payload.interest_rate_est ?? SEED_ACCOUNT.interest_rate_est},
      ${payload.commissions_total ?? SEED_ACCOUNT.commissions_total},
      ${payload.margin_debt ?? Math.max(0, -(payload.cash_end ?? SEED_ACCOUNT.cash_end))},
      ${payload.mtm ?? SEED_ACCOUNT.mtm},
      ${payload.trades_sales ?? SEED_ACCOUNT.trades_sales},
      ${payload.trades_purchase ?? SEED_ACCOUNT.trades_purchase}
    ) RETURNING *;
  `;
  return mapAccountRow(result.rows[0]);
}

export async function listRules(): Promise<Rule[]> {
  await ensureDb();
  const result = await sql`SELECT * FROM rules ORDER BY rule_number ASC;`;
  return result.rows.map((row) => mapRuleRow(row));
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  await ensureDb();
  const result = await sql`SELECT * FROM journal_entries ORDER BY created_at DESC;`;
  return result.rows.map((row) => mapJournalRow(row));
}

export async function listJournalEntriesByTrade(tradeId: number): Promise<JournalEntry[]> {
  await ensureDb();
  const result = await sql`
    SELECT * FROM journal_entries
    WHERE trade_id = ${tradeId}
    ORDER BY created_at DESC;
  `;
  return result.rows.map((row) => mapJournalRow(row));
}

export async function createJournalEntry(payload: Omit<JournalEntry, "id" | "created_at">): Promise<JournalEntry> {
  await ensureDb();
  const result = await sql`
    INSERT INTO journal_entries (trade_id, type, thesis, emotional_state, plan_adherence_score, notes)
    VALUES (${payload.trade_id}, ${payload.type}, ${payload.thesis}, ${payload.emotional_state}, ${payload.plan_adherence_score}, ${payload.notes})
    RETURNING *;
  `;
  return mapJournalRow(result.rows[0]);
}

export async function listStockPositions(): Promise<StockPosition[]> {
  await ensureDb();
  const result = await sql`SELECT * FROM stock_positions ORDER BY ticker ASC;`;
  return result.rows.map((row) => mapStockRow(row));
}

export async function getSettings(): Promise<DashboardSettings> {
  await ensureDb();
  const result = await sql`SELECT * FROM settings ORDER BY id ASC LIMIT 1;`;
  if (!result.rowCount) {
    await sql`
      INSERT INTO settings (account_name, account_id, account_type, interest_rate_est, price_api, alpha_vantage_key)
      VALUES (${SEED_SETTINGS.account_name}, ${SEED_SETTINGS.account_id}, ${SEED_SETTINGS.account_type}, ${SEED_SETTINGS.interest_rate_est}, ${SEED_SETTINGS.price_api}, ${SEED_SETTINGS.alpha_vantage_key});
    `;
    const seeded = await sql`SELECT * FROM settings ORDER BY id ASC LIMIT 1;`;
    return mapSettingsRow(seeded.rows[0]);
  }
  return mapSettingsRow(result.rows[0]);
}

export async function updateSettings(payload: Partial<DashboardSettings>): Promise<DashboardSettings> {
  await ensureDb();
  const current = await getSettings();
  const result = await sql`
    UPDATE settings
    SET
      account_name = ${payload.account_name ?? current.account_name},
      account_id = ${payload.account_id ?? current.account_id},
      account_type = ${payload.account_type ?? current.account_type},
      interest_rate_est = ${payload.interest_rate_est ?? current.interest_rate_est},
      price_api = ${payload.price_api ?? current.price_api},
      alpha_vantage_key = ${payload.alpha_vantage_key ?? current.alpha_vantage_key}
    WHERE id = ${current.id}
    RETURNING *;
  `;
  return mapSettingsRow(result.rows[0]);
}

export async function insertIbkrSyncSnapshot(payload: IbkrSyncPayload): Promise<IbkrSyncSnapshot> {
  await ensureDb();
  const fetchedAt = payload.fetched_at ? new Date(payload.fetched_at) : new Date();
  const normalizedFetchedAt = Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt;

  const result = await sql`
    INSERT INTO ibkr_sync_snapshots (
      account_id,
      source,
      fetched_at,
      summary,
      positions,
      trades,
      notes
    ) VALUES (
      ${payload.account_id},
      ${payload.source || "cpgw-local"},
      ${normalizedFetchedAt.toISOString()},
      ${JSON.stringify(payload.summary ?? {})}::jsonb,
      ${JSON.stringify(payload.positions ?? [])}::jsonb,
      ${JSON.stringify(payload.trades ?? [])}::jsonb,
      ${JSON.stringify(payload.notes ?? [])}::jsonb
    )
    RETURNING *;
  `;
  return mapIbkrSnapshotRow(result.rows[0]);
}

export async function getLatestIbkrSyncSnapshot(): Promise<IbkrSyncSnapshot | null> {
  await ensureDb();
  const result = await sql`
    SELECT * FROM ibkr_sync_snapshots
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  `;
  if (!result.rowCount) return null;
  return mapIbkrSnapshotRow(result.rows[0]);
}

export async function listIbkrSyncSnapshots(limit = 25): Promise<IbkrSyncSnapshot[]> {
  await ensureDb();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const result = await sql`
    SELECT * FROM ibkr_sync_snapshots
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit};
  `;
  return result.rows.map((row) => mapIbkrSnapshotRow(row));
}

export async function clearIbkrSyncSnapshots(): Promise<number> {
  await ensureDb();
  const countResult = await sql`SELECT COUNT(*)::int AS count FROM ibkr_sync_snapshots;`;
  const count = Number(countResult.rows[0]?.count ?? 0);
  await sql`TRUNCATE TABLE ibkr_sync_snapshots RESTART IDENTITY;`;
  return count;
}

export async function resetAllData() {
  await ensureDb();
  await sql`TRUNCATE TABLE journal_entries, trades, rules, stock_positions, settings, account_snapshots, ibkr_sync_snapshots RESTART IDENTITY CASCADE;`;
  await seedDatabase();
}

export async function exportAllData() {
  const [account, trades, rules, journals, settings, stocks, ibkrSnapshots] = await Promise.all([
    getLatestAccountSnapshot(),
    listTrades(),
    listRules(),
    listJournalEntries(),
    getSettings(),
    listStockPositions(),
    listIbkrSyncSnapshots(100),
  ]);

  return {
    account_snapshot: account,
    trades,
    rules,
    journal_entries: journals,
    settings,
    stock_positions: stocks,
    ibkr_sync_snapshots: ibkrSnapshots,
    exported_at: new Date().toISOString(),
  };
}
