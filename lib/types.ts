export type TradeDirection = "Bullish" | "Bearish" | "Neutral";

export type TradeStatus = "OPEN" | "WIN" | "LOSS" | "EXPIRED";

export type Catalyst =
  | "Earnings"
  | "Post-Earnings"
  | "Nuclear/AI"
  | "Crypto"
  | "Speculation"
  | "None";

export type JournalEntryType = "pre_trade" | "post_trade";

export type RuleSeverity = "critical" | "high" | "medium" | "info";

export type PositionType = "option" | "stock";

export interface AccountSnapshot {
  id: number;
  created_at: string;
  period_start: string;
  period_end: string;
  start_nav: number;
  end_nav: number;
  twr: number;
  cash_start: number;
  cash_end: number;
  cash_settled: number;
  stock_long: number;
  stock_short: number;
  stock_total: number;
  options_long: number;
  options_short: number;
  options_total: number;
  interest_accrued: number;
  interest_rate_est: number;
  commissions_total: number;
  margin_debt: number;
  mtm?: number | null;
  trades_sales?: number | null;
  trades_purchase?: number | null;
}

export interface StockPosition {
  id: number;
  created_at: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  cost_price: number;
  close_price: number;
  unrealized_pl: number;
  notes: string;
}

export interface ExitStrategy {
  type: "conservative" | "balanced" | "aggressive";
  label: string;
  action: string;
  reason: string;
}

export interface TradeTiming {
  theta_per_day: number | null;
  urgency: number | null;
  peak_window: string;
  hold_advice: string;
  exit_trigger: string;
  best_case: string;
}

export interface Trade {
  id: number;
  created_at: string;
  updated_at: string;
  ticker: string;
  strategy: string;
  legs: string;
  direction: TradeDirection;
  entry_date: string;
  exit_date: string | null;
  expiry_date: string | null;
  status: TradeStatus;
  position_type: PositionType;
  cost_basis: number;
  max_risk: number;
  max_profit: number | null;
  realized_pl: number | null;
  unrealized_pl: number | null;
  return_pct: number | null;
  commissions: number;
  contracts: number;
  catalyst: Catalyst;
  notes: string;
  lesson: string;
  breakeven: number | null;
  stop_loss: number | null;
  strike_long: number | null;
  strike_short: number | null;
  close_price_long: number | null;
  close_price_short: number | null;
  theta_per_day: number | null;
  urgency: number | null;
  peak_window: string;
  hold_advice: string;
  exit_trigger: string;
  best_case: string;
  exit_conservative: string;
  exit_balanced: string;
  exit_aggressive: string;
  source: "manual" | "import";
  ib_symbols: string[];
}

export interface TradeInput {
  ticker: string;
  strategy: string;
  legs: string;
  direction: TradeDirection;
  entry_date: string;
  exit_date?: string | null;
  expiry_date?: string | null;
  status: TradeStatus;
  position_type?: PositionType;
  cost_basis: number;
  max_risk: number;
  max_profit?: number | null;
  realized_pl?: number | null;
  unrealized_pl?: number | null;
  return_pct?: number | null;
  commissions?: number;
  contracts?: number;
  catalyst?: Catalyst;
  notes?: string;
  lesson?: string;
  breakeven?: number | null;
  stop_loss?: number | null;
  strike_long?: number | null;
  strike_short?: number | null;
  close_price_long?: number | null;
  close_price_short?: number | null;
  theta_per_day?: number | null;
  urgency?: number | null;
  peak_window?: string;
  hold_advice?: string;
  exit_trigger?: string;
  best_case?: string;
  exit_conservative?: string;
  exit_balanced?: string;
  exit_aggressive?: string;
  source?: "manual" | "import";
  ib_symbols?: string[];
}

export interface Rule {
  id: number;
  rule_number: number;
  title: string;
  description: string;
  severity: RuleSeverity;
  enabled: boolean;
}

export interface JournalEntry {
  id: number;
  trade_id: number;
  created_at: string;
  type: JournalEntryType;
  thesis: string;
  emotional_state: string;
  plan_adherence_score: number;
  notes: string;
}

export interface DashboardSettings {
  id: number;
  account_name: string;
  account_id: string;
  account_type: string;
  interest_rate_est: number;
  price_api: "yahoo" | "alphavantage" | "manual";
  alpha_vantage_key: string;
}

export interface PriceResponse {
  [ticker: string]: {
    price: number;
    source: string;
    updatedAt: string;
  };
}

export interface ParsedIBExecution {
  raw: string;
  symbol: string;
  ticker: string;
  expiry: string | null;
  strike: number | null;
  optionType: "C" | "P" | null;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission: number;
  timestamp: string | null;
}

export interface ParsedIBOpenPosition {
  raw: string;
  symbol: string;
  ticker: string;
  expiry: string | null;
  strike: number | null;
  optionType: "C" | "P" | null;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  closePrice: number;
}

export interface ParsedIBSummarySymbol {
  symbol: string;
  realizedPl: number;
  unrealizedPl: number;
  totalPl: number;
}

export interface ParsedIBStatement {
  account: Partial<AccountSnapshot>;
  executions: ParsedIBExecution[];
  openPositions: ParsedIBOpenPosition[];
  summaryBySymbol: ParsedIBSummarySymbol[];
  detectedTrades: TradeInput[];
  errors: string[];
}

export interface ImportPreviewTrade {
  preview_id: string;
  trade: TradeInput;
  matchStatus: "match" | "new" | "conflict";
  matchedTradeId: number | null;
  conflict_candidates: number[];
  reason: string;
}

export interface ImportPreview {
  account: Partial<AccountSnapshot>;
  trades: ImportPreviewTrade[];
  errors: string[];
}

export interface RuleCheckResult {
  tradeId: number;
  ticker: string;
  score: number;
  criticalViolations: number;
  checks: Array<{
    ruleNumber: number;
    title: string;
    severity: RuleSeverity;
    pass: boolean;
    detail: string;
  }>;
}

export interface PortfolioRuleChecks {
  totalRiskBudgetPass: boolean;
  totalRiskPct: number;
  totalRiskAmount: number;
  positionCountPass: boolean;
  positionCount: number;
  earningsConcentrationPass: boolean;
  earningsCount: number;
}
