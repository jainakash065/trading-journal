import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildDashboard, type Dashboard, type DashboardPeriodKey } from "../server/src/dashboard";
import { initializeDatabase } from "../server/src/db";
import { addExit, createTrade, getTrade, updateActiveStopLoss } from "../server/src/repository";

const dashboardToday: Date = new Date("2026-05-02T00:00:00Z");

describe("dashboard period metrics", () => {
  it("marks period capital unavailable before capital history starts", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    const dashboard: Dashboard = buildDashboard(db, "last_fy", dashboardToday);
    expect(dashboard.periodCapitalAvailable).toBe(false);
    expect(dashboard.periodStartingCapital).toBeNull();
    expect(dashboard.periodEndingCapital).toBeNull();
    expect(dashboard.periodCapitalChange).toBeNull();
    expect(dashboard.periodCapitalChangePercentage).toBeNull();
  });

  it("defaults current month to zero when no trades closed in the current month", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    const dashboard: Dashboard = buildDashboard(db, "this_month", dashboardToday);
    expect(dashboard.period).toMatchObject({
      key: "this_month",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    expect(dashboard.periodPnl).toBe(0);
    expect(dashboard.periodBookedPnl).toBe(0);
    expect(dashboard.periodClosedTradePnl).toBe(0);
    expect(dashboard.periodOpenRealizedPnl).toBe(0);
    expect(dashboard.periodClosedTrades).toBe(0);
    expect(dashboard.periodCapitalAvailable).toBe(true);
    expect(dashboard.periodStartingCapital).toBe(566556.4);
    expect(dashboard.periodEndingCapital).toBe(566556.4);
  });

  it("includes April closed trades in last month and current FY", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    const lastMonth: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    const currentFy: Dashboard = buildDashboard(db, "current_fy", dashboardToday);
    expectPeriodPnl(lastMonth, "last_month", 16556.4);
    expect(lastMonth.periodStartingCapital).toBe(550000);
    expect(lastMonth.periodEndingCapital).toBe(566556.4);
    expect(lastMonth.periodCapitalChange).toBe(16556.4);
    expect(lastMonth.periodCapitalChangePercentage).toBe(3.01);
    expect(lastMonth.periodBookedPnl).toBe(16556.4);
    expect(lastMonth.periodClosedTradePnl).toBe(16556.4);
    expect(lastMonth.periodOpenRealizedPnl).toBe(0);
    expect(lastMonth.maxDrawdown).toBe(0);
    expectPeriodPnl(currentFy, "current_fy", 16556.4);
    expect(currentFy.period.startDate).toBe("2026-04-01");
    expect(currentFy.period.endDate).toBe("2027-03-31");
    expect(currentFy.periodStartingCapital).toBe(550000);
  });

  it("starts all time from configured capital and ends at current capital", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    const dashboard: Dashboard = buildDashboard(db, "all_time", dashboardToday);
    expect(dashboard.period.startDate).toBeNull();
    expect(dashboard.periodStartingCapital).toBe(550000);
    expect(dashboard.periodEndingCapital).toBe(566556.4);
    expect(dashboard.periodPnl).toBe(16556.4);
    expect(dashboard.periodBookedPnl).toBe(16556.4);
    expect(dashboard.periodClosedTradePnl).toBe(16556.4);
    expect(dashboard.periodOpenRealizedPnl).toBe(0);
  });

  it("separates booked pnl from closed trade pnl when a trade is partially exited", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    createPartiallyExitedTrade(db);
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(dashboard.periodBookedPnl).toBe(26006.4);
    expect(dashboard.periodClosedTradePnl).toBe(16556.4);
    expect(dashboard.periodOpenRealizedPnl).toBe(9450);
    expect(dashboard.maxDrawdown).toBe(0);
    expect(dashboard.periodCapitalChange).toBe(dashboard.periodBookedPnl);
    expect(dashboard.periodPnl).toBe(dashboard.periodClosedTradePnl);
    expect(dashboard.periodClosedTrades).toBe(1);
    expect(dashboard.openRiskExposure).toBe(825.3);
  });

  it("uses active stop loss for current open risk without changing original stop loss", () => {
    const db: Database.Database = createDashboardDatabase();
    const atherTradeId: number = createPartiallyExitedTrade(db);
    createOpenTrade(db, {
      symbol: "URBANCO",
      entryPrice: 145.4467,
      quantity: 688,
      stopLoss: 141.8105
    });
    expect(getTrade(db, atherTradeId)?.activeStopLoss).toBe(766.35);
    updateActiveStopLoss(db, { tradeId: atherTradeId, activeStopLoss: 786 });
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(getTrade(db, atherTradeId)?.stopLoss).toBe(766.35);
    expect(getTrade(db, atherTradeId)?.activeStopLoss).toBe(786);
    expect(dashboard.openRiskExposure).toBe(2501.71);
  });

  it("caps open risk at zero when active stop is above entry", () => {
    const db: Database.Database = createDashboardDatabase();
    const tradeId: number = createOpenTrade(db, {
      symbol: "TRAIL",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 90
    });
    updateActiveStopLoss(db, { tradeId, activeStopLoss: 105 });
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(dashboard.openRiskExposure).toBe(0);
  });

  it("rejects active stop updates for closed trades", () => {
    const db: Database.Database = createDashboardDatabase();
    const tradeId: number = createMtarTechTrade(db);
    expect(() => updateActiveStopLoss(db, { tradeId, activeStopLoss: 3685 })).toThrow("Active stop can only be updated for open trades");
  });

  it("uses booked exits for drawdown inside a winning trade with an early partial loss", () => {
    const db: Database.Database = createDashboardDatabase();
    createWinningTradeWithEarlyPartialLoss(db);
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(dashboard.periodBookedPnl).toBe(75);
    expect(dashboard.periodClosedTradePnl).toBe(75);
    expect(dashboard.maxDrawdown).toBe(-25);
  });

  it("calculates R expectancy and R distribution from closed trades", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "AVANTI", finalR: -1, entryDate: "2026-04-01", exitDate: "2026-04-03" });
    createClosedTradeWithFinalR(db, { symbol: "GLENMARK", finalR: 0.18, entryDate: "2026-04-02", exitDate: "2026-04-04" });
    createClosedTradeWithFinalR(db, { symbol: "NATIONALUM1", finalR: -1, entryDate: "2026-04-03", exitDate: "2026-04-05" });
    createClosedTradeWithFinalR(db, { symbol: "DATAPATTNS", finalR: -1, entryDate: "2026-04-04", exitDate: "2026-04-06" });
    createClosedTradeWithFinalR(db, { symbol: "NATIONALUM2", finalR: 0.76, entryDate: "2026-04-05", exitDate: "2026-04-07" });
    createClosedTradeWithFinalR(db, { symbol: "MTARTECH", finalR: 11.23, entryDate: "2026-04-06", exitDate: "2026-04-08" });
    createClosedTradeWithFinalR(db, { symbol: "TATAMOTORS", finalR: -0.54, entryDate: "2026-04-07", exitDate: "2026-04-09" });
    createClosedTradeWithFinalR(db, { symbol: "OLECTRA", finalR: 0.32, entryDate: "2026-04-08", exitDate: "2026-04-10" });

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.winPercentage).toBe(50);
    expect(dashboard.lossPercentage).toBe(50);
    expect(dashboard.averageWinningR).toBe(3.12);
    expect(dashboard.averageLosingR).toBe(0.89);
    expect(dashboard.averageWinningHoldDays).toBe(3);
    expect(dashboard.averageLosingHoldDays).toBe(3);
    expect(dashboard.rExpectancy).toBe(1.12);
    expect(dashboard.medianR).toBe(-0.18);
    expect(dashboard.largestWinnerR).toBe(11.23);
    expect(dashboard.expectancyWithoutLargestWinner).toBe(-0.33);
    expect(dashboard.rDistribution).toEqual([
      { label: "<= -1R", count: 3 },
      { label: "-1R to 0R", count: 1 },
      { label: "0R to 1R", count: 3 },
      { label: "1R to 3R", count: 0 },
      { label: "3R to 5R", count: 0 },
      { label: "> 5R", count: 1 }
    ]);
  });

  it("calculates median R for an odd number of closed trades", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "ODDLOSS", finalR: -1, entryDate: "2026-04-01", exitDate: "2026-04-03" });
    createClosedTradeWithFinalR(db, { symbol: "ODDMID", finalR: 0.5, entryDate: "2026-04-02", exitDate: "2026-04-04" });
    createClosedTradeWithFinalR(db, { symbol: "ODDWIN", finalR: 2, entryDate: "2026-04-03", exitDate: "2026-04-05" });

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.medianR).toBe(0.5);
  });

  it("calculates average winner and loser holding days while ignoring breakeven trades", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "WINLONG", finalR: 2, entryDate: "2026-04-01", exitDate: "2026-04-05" });
    createClosedTradeWithFinalR(db, { symbol: "WINSHORT", finalR: 1, entryDate: "2026-04-10", exitDate: "2026-04-10" });
    createClosedTradeWithFinalR(db, { symbol: "LOSS", finalR: -1, entryDate: "2026-04-12", exitDate: "2026-04-13" });
    createClosedTradeWithFinalR(db, { symbol: "BREAKEVEN", finalR: 0, entryDate: "2026-04-01", exitDate: "2026-04-20" });

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.averageWinningHoldDays).toBe(3);
    expect(dashboard.averageLosingHoldDays).toBe(2);
  });

  it("infers capital history start date for existing journal data", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);
    db.prepare("DELETE FROM settings WHERE key = 'capitalHistoryStartDate'").run();
    initializeDatabase(db);
    const dashboard: Dashboard = buildDashboard(db, "current_fy", dashboardToday);
    expect(dashboard.capitalHistoryStartDate).toBe("2026-04-07");
    expect(dashboard.periodStartingCapital).toBe(550000);
  });
});

function createDashboardDatabase(): Database.Database {
  const db: Database.Database = new Database(":memory:");
  initializeDatabase(db);
  return db;
}

function createMtarTechTrade(db: Database.Database): number {
  const tradeId: number = createTrade(db, {
    symbol: "MTARTECH",
    market: "India",
    direction: "Buy",
    entryDate: "2026-04-07",
    entryPrice: 3685,
    quantity: 16,
    stopLoss: 3592.875,
    riskPercentage: 0.5,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "Breakout",
    emotionalState: "",
    confidence: 4,
    notes: "",
    checklistResponses: []
  });
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-09", exitPrice: 4212.9, quantity: 6 }));
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-15", exitPrice: 4688.9, quantity: 5 }));
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-23", exitPrice: 5358.9, quantity: 5 }));
  db.prepare("UPDATE settings SET value = '2026-04-01' WHERE key = 'capitalHistoryStartDate'").run();
  return tradeId;
}

function createPartiallyExitedTrade(db: Database.Database): number {
  const tradeId: number = createTrade(db, {
    symbol: "ATHER",
    market: "India",
    direction: "Buy",
    entryDate: "2026-04-09",
    entryPrice: 786,
    quantity: 126,
    stopLoss: 766.35,
    riskPercentage: 0.5,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "Imported",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: []
  });
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-10", exitPrice: 865, quantity: 42 }));
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-13", exitPrice: 932, quantity: 42 }));
  return tradeId;
}

function createWinningTradeWithEarlyPartialLoss(db: Database.Database): number {
  const tradeId: number = createTrade(db, {
    symbol: "CURVE",
    market: "India",
    direction: "Buy",
    entryDate: "2026-04-09",
    entryPrice: 100,
    quantity: 10,
    stopLoss: 90,
    riskPercentage: 0.5,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "Drawdown test",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: []
  });
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-10", exitPrice: 95, quantity: 5 }));
  addExit(db, createExitInput({ tradeId, exitDate: "2026-04-20", exitPrice: 120, quantity: 5 }));
  db.prepare("UPDATE settings SET value = '2026-04-01' WHERE key = 'capitalHistoryStartDate'").run();
  return tradeId;
}

function createClosedTradeWithFinalR(
  db: Database.Database,
  params: {
    readonly symbol: string;
    readonly finalR: number;
    readonly entryDate: string;
    readonly exitDate: string;
  }
): number {
  const entryPrice = 100;
  const quantity = 10;
  const stopLoss = 90;
  const exitPrice = entryPrice + (params.finalR * ((entryPrice - stopLoss) * quantity)) / quantity;
  const tradeId: number = createTrade(db, {
    symbol: params.symbol,
    market: "India",
    direction: "Buy",
    entryDate: params.entryDate,
    entryPrice,
    quantity,
    stopLoss,
    riskPercentage: 0.5,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "R analytics test",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: []
  });
  addExit(db, createExitInput({ tradeId, exitDate: params.exitDate, exitPrice, quantity }));
  db.prepare("UPDATE settings SET value = '2026-04-01' WHERE key = 'capitalHistoryStartDate'").run();
  return tradeId;
}

function createOpenTrade(
  db: Database.Database,
  params: {
    readonly symbol: string;
    readonly entryPrice: number;
    readonly quantity: number;
    readonly stopLoss: number;
  }
): number {
  return createTrade(db, {
    symbol: params.symbol,
    market: "India",
    direction: "Buy",
    entryDate: "2026-04-09",
    entryPrice: params.entryPrice,
    quantity: params.quantity,
    stopLoss: params.stopLoss,
    riskPercentage: 0.5,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "Open risk test",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: []
  });
}

function createExitInput(params: {
  readonly tradeId: number;
  readonly exitDate: string;
  readonly exitPrice: number;
  readonly quantity: number;
}) {
  return {
    tradeId: params.tradeId,
    exitDate: params.exitDate,
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    reason: "",
    emotionalState: "",
    notes: ""
  };
}

function expectPeriodPnl(dashboard: Dashboard, period: DashboardPeriodKey, pnl: number): void {
  expect(dashboard.period.key).toBe(period);
  expect(dashboard.periodPnl).toBe(pnl);
  expect(dashboard.periodClosedTrades).toBe(1);
  expect(dashboard.winRate).toBe(100);
  expect(dashboard.averageR).toBe(11.23);
}
