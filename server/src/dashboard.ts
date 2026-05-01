import type Database from "better-sqlite3";
import { getCurrentCapital, getSettings } from "./repository";

type ClosedTradeMetric = {
  readonly id: number;
  readonly symbol: string;
  readonly setupName: string | null;
  readonly realizedPnl: number;
  readonly finalR: number;
  readonly closedDate: string;
  readonly followedPlan: number | null;
  readonly ruleScore: number | null;
};

export type Dashboard = {
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly totalRealizedPnl: number;
  readonly monthlyPnl: number;
  readonly weeklyPnl: number;
  readonly winRate: number;
  readonly averageWinner: number;
  readonly averageLoser: number;
  readonly profitFactor: number;
  readonly averageR: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly openTrades: number;
  readonly openRiskExposure: number;
  readonly bestSetup: string;
  readonly worstSetup: string;
  readonly ruleFollowedPnl: number;
  readonly ruleBrokenPnl: number;
  readonly mistakeFrequency: readonly { readonly label: string; readonly count: number }[];
  readonly capitalCurve: readonly { readonly date: string; readonly capital: number }[];
};

export function buildDashboard(db: Database.Database): Dashboard {
  const settings: Record<string, string> = getSettings(db);
  const startingCapital: number = Number(settings.startingCapital ?? 0);
  const closedTrades: readonly ClosedTradeMetric[] = listClosedTradeMetrics(db);
  const totalRealizedPnl: number = round(closedTrades.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const winners: readonly ClosedTradeMetric[] = closedTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl > 0);
  const losers: readonly ClosedTradeMetric[] = closedTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl < 0);
  const winRate: number = closedTrades.length > 0 ? round((winners.length / closedTrades.length) * 100) : 0;
  const averageWinner: number = average(winners.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const averageLoser: number = average(losers.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const grossProfit: number = winners.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0);
  const grossLoss: number = Math.abs(losers.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  return {
    startingCapital,
    currentCapital: getCurrentCapital(db),
    totalRealizedPnl,
    monthlyPnl: sumSince(closedTrades, startOfMonth()),
    weeklyPnl: sumSince(closedTrades, startOfWeek()),
    winRate,
    averageWinner,
    averageLoser,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : round(grossProfit),
    averageR: average(closedTrades.map((trade: ClosedTradeMetric) => trade.finalR)),
    expectancy: average(closedTrades.map((trade: ClosedTradeMetric) => trade.realizedPnl)),
    maxDrawdown: calculateMaxDrawdown({ startingCapital, trades: closedTrades }),
    openTrades: getCount(db, "SELECT COUNT(*) AS count FROM trades WHERE status != 'closed'"),
    openRiskExposure: getOpenRiskExposure(db),
    bestSetup: getSetupByPnl(closedTrades, "best"),
    worstSetup: getSetupByPnl(closedTrades, "worst"),
    ruleFollowedPnl: round(closedTrades.filter((trade: ClosedTradeMetric) => trade.followedPlan === 1).reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0)),
    ruleBrokenPnl: round(closedTrades.filter((trade: ClosedTradeMetric) => trade.followedPlan === 0).reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0)),
    mistakeFrequency: getMistakeFrequency(db),
    capitalCurve: buildCapitalCurve({ db, startingCapital })
  };
}

function listClosedTradeMetrics(db: Database.Database): readonly ClosedTradeMetric[] {
  return db.prepare(`
    SELECT t.id, t.symbol, s.name AS setupName, COALESCE(SUM(e.pnl), 0) AS realizedPnl,
      CASE
        WHEN ((t.entry_price - t.stop_loss) * t.quantity) > 0
        THEN ROUND(COALESCE(SUM(e.pnl), 0) / ((t.entry_price - t.stop_loss) * t.quantity), 2)
        ELSE 0
      END AS finalR,
      MAX(e.exit_date) AS closedDate,
      r.followed_plan AS followedPlan, r.rule_score AS ruleScore
    FROM trades t
    JOIN trade_exits e ON e.trade_id = t.id
    LEFT JOIN setups s ON s.id = t.setup_id
    LEFT JOIN trade_reviews r ON r.trade_id = t.id
    WHERE t.status = 'closed'
    GROUP BY t.id
    ORDER BY closedDate ASC, t.id ASC
  `).all() as ClosedTradeMetric[];
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round(values.reduce((total: number, value: number) => total + value, 0) / values.length);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function startOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function startOfWeek(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function sumSince(trades: readonly ClosedTradeMetric[], date: string): number {
  return round(trades.filter((trade: ClosedTradeMetric) => trade.closedDate >= date).reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
}

function getCount(db: Database.Database, query: string): number {
  const row = db.prepare(query).get() as { count: number };
  return row.count;
}

function getOpenRiskExposure(db: Database.Database): number {
  const row = db.prepare("SELECT COALESCE(SUM(planned_risk_amount), 0) AS total FROM trades WHERE status != 'closed'").get() as { total: number };
  return round(row.total);
}

function getSetupByPnl(trades: readonly ClosedTradeMetric[], mode: "best" | "worst"): string {
  const totals: Map<string, number> = new Map();
  trades.forEach((trade: ClosedTradeMetric) => {
    const setup: string = trade.setupName ?? "Unassigned";
    totals.set(setup, (totals.get(setup) ?? 0) + trade.realizedPnl);
  });
  const sorted = [...totals.entries()].sort((a, b) => mode === "best" ? b[1] - a[1] : a[1] - b[1]);
  return sorted[0]?.[0] ?? "No closed trades";
}

function calculateMaxDrawdown(params: { readonly startingCapital: number; readonly trades: readonly ClosedTradeMetric[] }): number {
  let capital: number = params.startingCapital;
  let peak: number = params.startingCapital;
  let maxDrawdown: number = 0;
  params.trades.forEach((trade: ClosedTradeMetric) => {
    capital += trade.realizedPnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.min(maxDrawdown, capital - peak);
  });
  return round(maxDrawdown);
}

function getMistakeFrequency(db: Database.Database): readonly { readonly label: string; readonly count: number }[] {
  return db.prepare(`
    SELECT m.label, COUNT(*) AS count
    FROM trade_mistakes tm
    JOIN mistake_tags m ON m.id = tm.mistake_id
    GROUP BY m.id
    ORDER BY count DESC, m.label ASC
  `).all() as { readonly label: string; readonly count: number }[];
}

function buildCapitalCurve(params: { readonly db: Database.Database; readonly startingCapital: number }): readonly { readonly date: string; readonly capital: number }[] {
  const rows = params.db.prepare("SELECT entry_date AS date, amount FROM capital_ledger ORDER BY entry_date ASC, id ASC").all() as { date: string; amount: number }[];
  let capital: number = params.startingCapital;
  const curve: { date: string; capital: number }[] = [{ date: "Start", capital }];
  rows.forEach((row: { date: string; amount: number }) => {
    capital = round(capital + row.amount);
    curve.push({ date: row.date, capital });
  });
  return curve;
}
