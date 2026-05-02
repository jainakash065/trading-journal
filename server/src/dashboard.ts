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

type RealizedExitMetric = {
  readonly tradeId: number;
  readonly tradeStatus: string;
  readonly pnl: number;
  readonly exitDate: string;
};

export type DashboardPeriodKey = "all_time" | "current_fy" | "last_fy" | "this_month" | "last_month" | "this_week";

type DashboardPeriod = {
  readonly key: DashboardPeriodKey;
  readonly label: string;
  readonly startDate: string | null;
  readonly endDate: string;
};

type PeriodCapital = {
  readonly available: boolean;
  readonly startingCapital: number | null;
  readonly endingCapital: number | null;
  readonly change: number | null;
  readonly changePercentage: number | null;
};

type RDistributionBucket = {
  readonly label: string;
  readonly count: number;
};

type RAnalytics = {
  readonly winPercentage: number;
  readonly lossPercentage: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly rExpectancy: number;
  readonly medianR: number;
  readonly largestWinnerR: number;
  readonly expectancyWithoutLargestWinner: number;
  readonly rDistribution: readonly RDistributionBucket[];
};

export type Dashboard = {
  readonly period: DashboardPeriod;
  readonly capitalHistoryStartDate: string;
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly totalRealizedPnl: number;
  readonly periodCapitalAvailable: boolean;
  readonly periodStartingCapital: number | null;
  readonly periodEndingCapital: number | null;
  readonly periodCapitalChange: number | null;
  readonly periodCapitalChangePercentage: number | null;
  readonly periodPnl: number;
  readonly periodBookedPnl: number;
  readonly periodClosedTradePnl: number;
  readonly periodOpenRealizedPnl: number;
  readonly periodClosedTrades: number;
  readonly winRate: number;
  readonly winPercentage: number;
  readonly lossPercentage: number;
  readonly averageWinner: number;
  readonly averageLoser: number;
  readonly profitFactor: number;
  readonly averageR: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly rExpectancy: number;
  readonly medianR: number;
  readonly largestWinnerR: number;
  readonly expectancyWithoutLargestWinner: number;
  readonly rDistribution: readonly RDistributionBucket[];
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
  const capitalHistoryStartDate: string = settings.capitalHistoryStartDate ?? todayText;
  const period: DashboardPeriod = getDashboardPeriod(periodKey, today);
  const closedTrades: readonly ClosedTradeMetric[] = listClosedTradeMetrics(db);
  const realizedExits: readonly RealizedExitMetric[] = listRealizedExitMetrics(db);
  const periodTrades: readonly ClosedTradeMetric[] = filterTradesByPeriod(closedTrades, period);
  const periodExits: readonly RealizedExitMetric[] = filterExitsByPeriod(realizedExits, period);
  const totalRealizedPnl: number = round(closedTrades.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const periodClosedTradePnl: number = round(periodTrades.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const winners: readonly ClosedTradeMetric[] = periodTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl > 0);
  const losers: readonly ClosedTradeMetric[] = periodTrades.filter((trade: ClosedTradeMetric) => trade.realizedPnl < 0);
  const winRate: number = periodTrades.length > 0 ? round((winners.length / periodTrades.length) * 100) : 0;
  const rAnalytics: RAnalytics = calculateRAnalytics(periodTrades);
  const averageWinner: number = average(winners.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const averageLoser: number = average(losers.map((trade: ClosedTradeMetric) => trade.realizedPnl));
  const grossProfit: number = winners.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0);
  const grossLoss: number = Math.abs(losers.reduce((total: number, trade: ClosedTradeMetric) => total + trade.realizedPnl, 0));
  const currentCapital: number = getCurrentCapital(db);
  const periodCapital: PeriodCapital = getPeriodCapital({ db, period, startingCapital, todayText, capitalHistoryStartDate });
  return {
    period,
    capitalHistoryStartDate,
    startingCapital,
    currentCapital,
    totalRealizedPnl,
    periodCapitalAvailable: periodCapital.available,
    periodStartingCapital: periodCapital.startingCapital,
    periodEndingCapital: periodCapital.endingCapital,
    periodCapitalChange: periodCapital.change,
    periodCapitalChangePercentage: periodCapital.changePercentage,
    periodPnl: periodClosedTradePnl,
    periodBookedPnl: round(periodExits.reduce((total: number, exit: RealizedExitMetric) => total + exit.pnl, 0)),
    periodClosedTradePnl,
    periodOpenRealizedPnl: round(periodExits.filter((exit: RealizedExitMetric) => exit.tradeStatus !== "closed").reduce((total: number, exit: RealizedExitMetric) => total + exit.pnl, 0)),
    periodClosedTrades: periodTrades.length,
    winRate,
    winPercentage: rAnalytics.winPercentage,
    lossPercentage: rAnalytics.lossPercentage,
    averageWinner,
    averageLoser,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : round(grossProfit),
    averageR: average(periodTrades.map((trade: ClosedTradeMetric) => trade.finalR)),
    averageWinningR: rAnalytics.averageWinningR,
    averageLosingR: rAnalytics.averageLosingR,
    rExpectancy: rAnalytics.rExpectancy,
    medianR: rAnalytics.medianR,
    largestWinnerR: rAnalytics.largestWinnerR,
    expectancyWithoutLargestWinner: rAnalytics.expectancyWithoutLargestWinner,
    rDistribution: rAnalytics.rDistribution,
    expectancy: average(periodTrades.map((trade: ClosedTradeMetric) => trade.realizedPnl)),
    maxDrawdown: calculateBookedMaxDrawdown({ startingCapital: periodCapital.startingCapital ?? 0, exits: periodExits }),
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

function listRealizedExitMetrics(db: Database.Database): readonly RealizedExitMetric[] {
  return db.prepare(`
    SELECT e.trade_id AS tradeId, t.status AS tradeStatus, e.pnl, e.exit_date AS exitDate
    FROM trade_exits e
    JOIN trades t ON t.id = e.trade_id
    ORDER BY e.exit_date ASC, e.id ASC
  `).all() as RealizedExitMetric[];
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round(values.reduce((total: number, value: number) => total + value, 0) / values.length);
}

function averageRaw(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total: number, value: number) => total + value, 0) / values.length;
}

function calculateRAnalytics(trades: readonly ClosedTradeMetric[]): RAnalytics {
  const rValues: readonly number[] = trades.map((trade: ClosedTradeMetric) => trade.finalR);
  const winningRValues: readonly number[] = rValues.filter((value: number) => value > 0);
  const losingRValues: readonly number[] = rValues.filter((value: number) => value < 0);
  const winRateDecimal: number = trades.length > 0 ? winningRValues.length / trades.length : 0;
  const lossRateDecimal: number = trades.length > 0 ? losingRValues.length / trades.length : 0;
  const averageWinningRRaw: number = averageRaw(winningRValues);
  const averageLosingRRaw: number = averageRaw(losingRValues.map((value: number) => Math.abs(value)));
  return {
    winPercentage: round(winRateDecimal * 100),
    lossPercentage: round(lossRateDecimal * 100),
    averageWinningR: round(averageWinningRRaw),
    averageLosingR: round(averageLosingRRaw),
    rExpectancy: round((winRateDecimal * averageWinningRRaw) - (lossRateDecimal * averageLosingRRaw)),
    medianR: calculateMedian(rValues),
    largestWinnerR: winningRValues.length > 0 ? round(Math.max(...winningRValues)) : 0,
    expectancyWithoutLargestWinner: calculateExpectancyWithoutLargestWinner(rValues),
    rDistribution: calculateRDistribution(rValues)
  };
}

function calculateRExpectancy(params: {
  readonly winRateDecimal: number;
  readonly lossRateDecimal: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
}): number {
  return round((params.winRateDecimal * params.averageWinningR) - (params.lossRateDecimal * params.averageLosingR));
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted: readonly number[] = [...values].sort((a: number, b: number) => a - b);
  const middle: number = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return round(sorted[middle]);
  }
  return round((sorted[middle - 1] + sorted[middle]) / 2);
}

function calculateExpectancyWithoutLargestWinner(values: readonly number[]): number {
  const largestWinner: number = Math.max(0, ...values.filter((value: number) => value > 0));
  if (largestWinner === 0) {
    return calculateRAnalyticsFromValues(values).rExpectancy;
  }
  const removed: number[] = [...values];
  removed.splice(removed.indexOf(largestWinner), 1);
  return calculateRAnalyticsFromValues(removed).rExpectancy;
}

function calculateRAnalyticsFromValues(values: readonly number[]): Pick<RAnalytics, "rExpectancy"> {
  const winningRValues: readonly number[] = values.filter((value: number) => value > 0);
  const losingRValues: readonly number[] = values.filter((value: number) => value < 0);
  const winRateDecimal: number = values.length > 0 ? winningRValues.length / values.length : 0;
  const lossRateDecimal: number = values.length > 0 ? losingRValues.length / values.length : 0;
  const averageWinningR: number = averageRaw(winningRValues);
  const averageLosingR: number = averageRaw(losingRValues.map((value: number) => Math.abs(value)));
  return { rExpectancy: calculateRExpectancy({ winRateDecimal, lossRateDecimal, averageWinningR, averageLosingR }) };
}

function calculateRDistribution(values: readonly number[]): readonly RDistributionBucket[] {
  const buckets: RDistributionBucket[] = [
    { label: "<= -1R", count: 0 },
    { label: "-1R to 0R", count: 0 },
    { label: "0R to 1R", count: 0 },
    { label: "1R to 3R", count: 0 },
    { label: "3R to 5R", count: 0 },
    { label: "> 5R", count: 0 }
  ];
  values.forEach((value: number) => {
    const bucketIndex: number = getRDistributionIndex(value);
    buckets[bucketIndex] = { ...buckets[bucketIndex], count: buckets[bucketIndex].count + 1 };
  });
  return buckets;
}

function getRDistributionIndex(value: number): number {
  if (value <= -1) {
    return 0;
  }
  if (value < 0) {
    return 1;
  }
  if (value < 1) {
    return 2;
  }
  if (value < 3) {
    return 3;
  }
  if (value <= 5) {
    return 4;
  }
  return 5;
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

function filterExitsByPeriod(exits: readonly RealizedExitMetric[], period: DashboardPeriod): readonly RealizedExitMetric[] {
  return exits.filter((exit: RealizedExitMetric) => {
    const afterStart: boolean = period.startDate === null || exit.exitDate >= period.startDate;
    return afterStart && exit.exitDate <= period.endDate;
  });
}

function getCount(db: Database.Database, query: string): number {
  const row = db.prepare(query).get() as { count: number };
  return row.count;
}

function getOpenRiskExposure(db: Database.Database): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN (t.entry_price - t.stop_loss) > 0
        THEN (t.entry_price - t.stop_loss) * (t.quantity - COALESCE(x.exited_quantity, 0))
        ELSE 0
      END
    ), 0) AS total
    FROM trades t
    LEFT JOIN (
      SELECT trade_id, SUM(quantity) AS exited_quantity
      FROM trade_exits
      GROUP BY trade_id
    ) x ON x.trade_id = t.id
    WHERE t.status != 'closed'
  `).get() as { total: number };
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

function calculateBookedMaxDrawdown(params: { readonly startingCapital: number; readonly exits: readonly RealizedExitMetric[] }): number {
  let capital: number = params.startingCapital;
  let peak: number = params.startingCapital;
  let maxDrawdown: number = 0;
  params.exits.forEach((exit: RealizedExitMetric) => {
    capital += exit.pnl;
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

function getPeriodCapital(params: {
  readonly db: Database.Database;
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
  readonly todayText: string;
  readonly capitalHistoryStartDate: string;
}): PeriodCapital {
  if (params.period.endDate < params.capitalHistoryStartDate) {
    return { available: false, startingCapital: null, endingCapital: null, change: null, changePercentage: null };
  }
  const effectiveStartDate: string = getEffectiveCapitalStartDate(params.period, params.capitalHistoryStartDate);
  const startingCapital: number = getCapitalBeforeDate({
    db: params.db,
    startingCapital: params.startingCapital,
    capitalHistoryStartDate: params.capitalHistoryStartDate,
    date: effectiveStartDate
  });
  const endingCapital: number = getCapitalAtPeriodEnd(params);
  const change: number = round(endingCapital - startingCapital);
  return {
    available: true,
    startingCapital,
    endingCapital,
    change,
    changePercentage: startingCapital > 0 ? round((change / startingCapital) * 100) : 0
  };
}

function getEffectiveCapitalStartDate(period: DashboardPeriod, capitalHistoryStartDate: string): string {
  if (period.startDate === null || period.startDate < capitalHistoryStartDate) {
    return capitalHistoryStartDate;
  }
  return period.startDate;
}

function getCapitalBeforeDate(params: {
  readonly db: Database.Database;
  readonly startingCapital: number;
  readonly capitalHistoryStartDate: string;
  readonly date: string;
}): number {
  const row = params.db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM capital_ledger WHERE entry_date >= ? AND entry_date < ?")
    .get(params.capitalHistoryStartDate, params.date) as { readonly total: number };
  return round(params.startingCapital + row.total);
}

function getCapitalAtPeriodEnd(params: {
  readonly db: Database.Database;
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
  readonly todayText: string;
  readonly capitalHistoryStartDate: string;
}): number {
  const endDate: string = params.period.endDate >= params.todayText ? params.todayText : params.period.endDate;
  const row = params.db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM capital_ledger WHERE entry_date >= ? AND entry_date <= ?")
    .get(params.capitalHistoryStartDate, endDate) as { readonly total: number };
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
