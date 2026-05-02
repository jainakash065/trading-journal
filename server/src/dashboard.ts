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

export type DashboardPeriodKey = "all_time" | "current_fy" | "last_fy" | "this_month" | "last_month" | "this_week";

type DashboardPeriod = {
  readonly key: DashboardPeriodKey;
  readonly label: string;
  readonly startDate: string | null;
  readonly endDate: string;
};

export type Dashboard = {
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly totalRealizedPnl: number;
  readonly periodStartingCapital: number;
  readonly periodEndingCapital: number;
  readonly periodCapitalChange: number;
  readonly periodCapitalChangePercentage: number;
  readonly periodPnl: number;
  readonly periodClosedTrades: number;
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

export function buildDashboard(db: Database.Database, periodKey: DashboardPeriodKey = "this_month", today: Date = new Date()): Dashboard {
  const settings: Record<string, string> = getSettings(db);
  const startingCapital: number = Number(settings.startingCapital ?? 0);
  const todayText: string = formatDate(today);
  const period: DashboardPeriod = getDashboardPeriod(periodKey, today);
  const closedTrades: readonly ClosedTradeMetric[] = listClosedTradeMetrics(db);
  const periodTrades: readonly ClosedTradeMetric[] = filterTradesByPeriod(closedTrades, period);
  const totalRealizedPnl: number = round(closedTrades.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const winners: readonly ClosedTradeMetric[] = periodTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl > 0);
  const losers: readonly ClosedTradeMetric[] = periodTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl < 0);
  const winRate: number = periodTrades.length > 0 ? round((winners.length / periodTrades.length) * 100) : 0;
  const averageWinner: number = average(winners.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const averageLoser: number = average(losers.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const grossProfit: number = winners.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0);
  const grossLoss: number = Math.abs(losers.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const currentCapital: number = getCurrentCapital(db);
  const periodStartingCapital: number = getPeriodStartingCapital({ db, period, startingCapital });
  const periodEndingCapital: number = getPeriodEndingCapital({ db, period, startingCapital, currentCapital, todayText });
  const periodCapitalChange: number = round(periodEndingCapital - periodStartingCapital);
  return {
    period,
    startingCapital,
    currentCapital,
    totalRealizedPnl,
    periodStartingCapital,
    periodEndingCapital,
    periodCapitalChange,
    periodCapitalChangePercentage: periodStartingCapital > 0 ? round((periodCapitalChange / periodStartingCapital) * 100) : 0,
    periodPnl: round(periodTrades.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0)),
    periodClosedTrades: periodTrades.length,
    winRate,
    averageWinner,
    averageLoser,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : round(grossProfit),
    averageR: average(periodTrades.map((trade: ClosedTradeMetric) => trade.finalR)),
    expectancy: average(periodTrades.map((trade: ClosedTradeMetric) => trade.realizedPnl)),
    maxDrawdown: calculateMaxDrawdown({ startingCapital: periodStartingCapital, trades: periodTrades }),
    openTrades: getCount(db, "SELECT COUNT(*) AS count FROM trades WHERE status != 'closed'"),
    openRiskExposure: getOpenRiskExposure(db),
    bestSetup: getSetupByPnl(periodTrades, "best"),
    worstSetup: getSetupByPnl(periodTrades, "worst"),
    ruleFollowedPnl: round(periodTrades.filter((trade: ClosedTradeMetric) => trade.followedPlan === 1).reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0)),
    ruleBrokenPnl: round(periodTrades.filter((trade: ClosedTradeMetric) => trade.followedPlan === 0).reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0)),
    mistakeFrequency: getMistakeFrequency(db, period),
    capitalCurve: buildCapitalCurve({ db, startingCapital })
  };
}

export function parseDashboardPeriodKey(value: unknown): DashboardPeriodKey {
  const key: string = typeof value === "string" ? value : "this_month";
  if (key === "all_time" || key === "current_fy" || key === "last_fy" || key === "this_month" || key === "last_month" || key === "this_week") {
    return key;
  }
  return "this_month";
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

function getDashboardPeriod(periodKey: DashboardPeriodKey, today: Date): DashboardPeriod {
  const year: number = today.getUTCFullYear();
  const month: number = today.getUTCMonth();
  if (periodKey === "all_time") {
    return { key: periodKey, label: "All time", startDate: null, endDate: formatDate(today) };
  }
  if (periodKey === "current_fy") {
    const fyStartYear: number = month >= 3 ? year : year - 1;
    return createPeriod(periodKey, "Current FY", fyStartYear, 3, 1, fyStartYear + 1, 2, 31);
  }
  if (periodKey === "last_fy") {
    const currentFyStartYear: number = month >= 3 ? year : year - 1;
    return createPeriod(periodKey, "Last FY", currentFyStartYear - 1, 3, 1, currentFyStartYear, 2, 31);
  }
  if (periodKey === "last_month") {
    const start: Date = new Date(Date.UTC(year, month - 1, 1));
    const end: Date = new Date(Date.UTC(year, month, 0));
    return { key: periodKey, label: "Last month", startDate: formatDate(start), endDate: formatDate(end) };
  }
  if (periodKey === "this_week") {
    return getThisWeekPeriod(today);
  }
  const start: Date = new Date(Date.UTC(year, month, 1));
  const end: Date = new Date(Date.UTC(year, month + 1, 0));
  return { key: periodKey, label: "This month", startDate: formatDate(start), endDate: formatDate(end) };
}

function createPeriod(
  key: DashboardPeriodKey,
  label: string,
  startYear: number,
  startMonth: number,
  startDay: number,
  endYear: number,
  endMonth: number,
  endDay: number
): DashboardPeriod {
  return {
    key,
    label,
    startDate: formatDate(new Date(Date.UTC(startYear, startMonth, startDay))),
    endDate: formatDate(new Date(Date.UTC(endYear, endMonth, endDay)))
  };
}

function getThisWeekPeriod(today: Date): DashboardPeriod {
  const date: Date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day: number = date.getUTCDay();
  const startOffset: number = day === 0 ? -6 : 1 - day;
  const start: Date = new Date(date);
  start.setUTCDate(date.getUTCDate() + startOffset);
  const end: Date = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { key: "this_week", label: "This week", startDate: formatDate(start), endDate: formatDate(end) };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function filterTradesByPeriod(trades: readonly ClosedTradeMetric[], period: DashboardPeriod): readonly ClosedTradeMetric[] {
  return trades.filter((trade: ClosedTradeMetric) => {
    const afterStart: boolean = period.startDate === null || trade.closedDate >= period.startDate;
    return afterStart && trade.closedDate <= period.endDate;
  });
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

function getMistakeFrequency(db: Database.Database, period: DashboardPeriod): readonly { readonly label: string; readonly count: number }[] {
  const periodFilter: string = period.startDate === null ? "x.closed_date <= ?" : "x.closed_date >= ? AND x.closed_date <= ?";
  const values: readonly string[] = period.startDate === null ? [period.endDate] : [period.startDate, period.endDate];
  return db.prepare(`
    SELECT m.label, COUNT(*) AS count
    FROM trade_mistakes tm
    JOIN mistake_tags m ON m.id = tm.mistake_id
    JOIN trades t ON t.id = tm.trade_id
    JOIN (
      SELECT trade_id, MAX(exit_date) AS closed_date
      FROM trade_exits
      GROUP BY trade_id
    ) x ON x.trade_id = t.id
    WHERE t.status = 'closed' AND ${periodFilter}
    GROUP BY m.id
    ORDER BY count DESC, m.label ASC
  `).all(...values) as { readonly label: string; readonly count: number }[];
}

function getPeriodStartingCapital(params: {
  readonly db: Database.Database;
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
}): number {
  if (params.period.startDate === null) {
    return params.startingCapital;
  }
  const row = params.db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM capital_ledger WHERE entry_date < ?")
    .get(params.period.startDate) as { readonly total: number };
  return round(params.startingCapital + row.total);
}

function getPeriodEndingCapital(params: {
  readonly db: Database.Database;
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly todayText: string;
}): number {
  if (params.period.endDate >= params.todayText) {
    return params.currentCapital;
  }
  const row = params.db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM capital_ledger WHERE entry_date <= ?")
    .get(params.period.endDate) as { readonly total: number };
  return round(params.startingCapital + row.total);
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
