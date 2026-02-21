/**
 * Documentation-first schema map for the trading dashboard tables.
 * Runtime migrations are handled in `lib/db.ts` with CREATE TABLE statements.
 */

export const tables = {
  account_snapshots: "account_snapshots",
  trades: "trades",
  rules: "rules",
  journal_entries: "journal_entries",
  settings: "settings",
  stock_positions: "stock_positions",
} as const;
