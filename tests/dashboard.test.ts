import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildDashboard, type Dashboard, type DashboardPeriodKey } from "../server/src/dashboard";
import { initializeDatabase } from "../server/src/db";
import { addExit, createTrade } from "../server/src/repository";

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
  });

  it("uses booked exits for drawdown inside a winning trade with an early partial loss", () => {
    const db: Database.Database = createDashboardDatabase();
    createWinningTradeWithEarlyPartialLoss(db);
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(dashboard.periodBookedPnl).toBe(75);
    expect(dashboard.periodClosedTradePnl).toBe(75);
    expect(dashboard.maxDrawdown).toBe(-25);
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
