import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildDashboard, getDashboardPeriod, parseLastNTradeCount, type Dashboard, type DashboardPeriod, type DashboardPeriodKey } from "../server/src/dashboard";
import { initializeDatabase } from "../server/src/db";
import { addExit, createTrade, getTrade, listClosedTradesPage, updateActiveStopLoss, updateCurrentPrice } from "../server/src/repository";

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
    expect(dashboard.capitalCurve).toEqual([]);
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
    expect(dashboard.capitalCurve).toEqual([
      { date: "2026-05-01", capital: 566556.4, dailyPnl: 0 },
      { date: "2026-05-02", capital: 566556.4, dailyPnl: 0 }
    ]);
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
    expect(lastMonth.capitalCurve).toEqual([
      { date: "2026-04-01", capital: 550000, dailyPnl: 0 },
      { date: "2026-04-09", capital: 553167.4, dailyPnl: 3167.4 },
      { date: "2026-04-15", capital: 558186.9, dailyPnl: 5019.5 },
      { date: "2026-04-23", capital: 566556.4, dailyPnl: 8369.5 },
      { date: "2026-04-30", capital: 566556.4, dailyPnl: 0 }
    ]);
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
    expect(dashboard.capitalCurve[0]).toEqual({ date: "2026-04-01", capital: 550000, dailyPnl: 0 });
    expect(dashboard.capitalCurve[dashboard.capitalCurve.length - 1]).toEqual({ date: "2026-05-02", capital: 566556.4, dailyPnl: 0 });
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
    expect(dashboard.capitalCurve).toEqual([
      { date: "2026-04-01", capital: 550000, dailyPnl: 0 },
      { date: "2026-04-09", capital: 553167.4, dailyPnl: 3167.4 },
      { date: "2026-04-10", capital: 556485.4, dailyPnl: 3318 },
      { date: "2026-04-13", capital: 562617.4, dailyPnl: 6132 },
      { date: "2026-04-15", capital: 567636.9, dailyPnl: 5019.5 },
      { date: "2026-04-23", capital: 576006.4, dailyPnl: 8369.5 },
      { date: "2026-04-30", capital: 576006.4, dailyPnl: 0 }
    ]);
  });

  it("groups multiple equity curve exits on the same date", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "SAME1", finalR: 1, entryDate: "2026-04-01", exitDate: "2026-04-05" });
    createClosedTradeWithFinalR(db, { symbol: "SAME2", finalR: 1, entryDate: "2026-04-02", exitDate: "2026-04-05" });
    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);
    expect(dashboard.capitalCurve).toEqual([
      { date: "2026-04-01", capital: 550000, dailyPnl: 0 },
      { date: "2026-04-05", capital: 550200, dailyPnl: 200 },
      { date: "2026-04-30", capital: 550200, dailyPnl: 0 }
    ]);
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

  it("calculates unrealized metrics from manual current price and remaining quantity", () => {
    const db: Database.Database = createDashboardDatabase();
    const tradeId: number = createPartiallyExitedTrade(db);
    expect(getTrade(db, tradeId)).toMatchObject({
      currentPrice: null,
      currentPriceUpdatedAt: null,
      unrealizedPnl: 0,
      unrealizedR: 0,
      unrealizedPortfolioImpactPercentage: 0
    });
    updateCurrentPrice(db, { tradeId, currentPrice: 900 });
    const trade = getTrade(db, tradeId);
    expect(trade).toMatchObject({
      currentPrice: 900,
      unrealizedPnl: 4788,
      unrealizedR: 1.93,
      unrealizedPortfolioImpactPercentage: 0.87
    });
    expect(trade?.currentPriceUpdatedAt).toEqual(expect.any(String));
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

  it("rejects current price updates for closed trades and non-positive prices", () => {
    const db: Database.Database = createDashboardDatabase();
    const openTradeId: number = createOpenTrade(db, {
      symbol: "OPEN",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 90
    });
    const closedTradeId: number = createMtarTechTrade(db);
    expect(() => updateCurrentPrice(db, { tradeId: openTradeId, currentPrice: 0 })).toThrow("Current price must be positive");
    expect(() => updateCurrentPrice(db, { tradeId: closedTradeId, currentPrice: 4000 })).toThrow("Current price can only be updated for open trades");
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

  it("defaults and validates last N closed trade sample size", () => {
    expect(parseLastNTradeCount(undefined)).toBe(20);
    expect(parseLastNTradeCount("abc")).toBe(20);
    expect(parseLastNTradeCount("10")).toBe(10);
    expect(parseLastNTradeCount("50")).toBe(50);
  });

  it("calculates last N analytics from the most recent closed entry trades", () => {
    const db: Database.Database = createDashboardDatabase();
    for (let index = 1; index <= 12; index += 1) {
      const day: string = String(index).padStart(2, "0");
      createClosedTradeWithFinalR(db, { symbol: `CLOSED${day}`, finalR: 1, entryDate: `2026-04-${day}`, exitDate: `2026-04-${day}` });
    }
    createPartiallyExitedTrade(db);

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday, 10);

    expect(dashboard.lastNTrades.selectedN).toBe(10);
    expect(dashboard.lastNTrades.actualCount).toBe(10);
    expect(dashboard.lastNTrades.pnl).toBe(1000);
    expect(dashboard.lastNTrades.winRate).toBe(100);
    expect(dashboard.lastNTrades.averageR).toBe(1);
    expect(dashboard.lastNTrades.rExpectancy).toBe(1);
    expect(dashboard.lastNTrades.profitFactor).toBe(1000);
    expect(dashboard.lastNTrades.averageWinningR).toBe(1);
    expect(dashboard.lastNTrades.averageLosingR).toBe(0);
    expect(dashboard.lastNTrades.averageWinningHoldDays).toBe(1);
    expect(dashboard.lastNTrades.averageLosingHoldDays).toBe(0);
    expect(dashboard.lastNTrades.rDistribution).toEqual([
      { label: "<= -1R", count: 0 },
      { label: "-1R to 0R", count: 0 },
      { label: "0R to 1R", count: 0 },
      { label: "1R to 3R", count: 10 },
      { label: "3R to 5R", count: 0 },
      { label: "> 5R", count: 0 }
    ]);
    expect(dashboard.periodClosedTrades).toBe(12);
  });

  it("keeps last N analytics independent from the selected dashboard period", () => {
    const db: Database.Database = createDashboardDatabase();
    createMtarTechTrade(db);

    const dashboard: Dashboard = buildDashboard(db, "this_month", dashboardToday, 20);

    expect(dashboard.periodClosedTrades).toBe(0);
    expect(dashboard.periodClosedTradePnl).toBe(0);
    expect(dashboard.lastNTrades.selectedN).toBe(20);
    expect(dashboard.lastNTrades.actualCount).toBe(1);
    expect(dashboard.lastNTrades.pnl).toBe(16556.4);
    expect(dashboard.lastNTrades.averageR).toBe(11.23);
  });

  it("calculates setup analytics from period closed trades", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "PULLBACKWIN", finalR: 2, entryDate: "2026-04-01", exitDate: "2026-04-05", setupId: 2 });
    createClosedTradeWithFinalR(db, { symbol: "BREAKOUTWIN", finalR: 1, entryDate: "2026-04-02", exitDate: "2026-04-06", setupId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "BREAKOUTLOSS", finalR: -1, entryDate: "2026-04-03", exitDate: "2026-04-07", setupId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "NOSETUP", finalR: -0.5, entryDate: "2026-04-04", exitDate: "2026-04-08", setupId: null });
    createPartiallyExitedTrade(db);

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.setupAnalytics).toEqual([
      {
        setupName: "Pullback",
        closedTrades: 1,
        winRate: 100,
        rExpectancy: 2,
        averageWinningR: 2,
        averageLosingR: 0,
        medianR: 2,
        pnl: 200
      },
      {
        setupName: "Breakout",
        closedTrades: 2,
        winRate: 50,
        rExpectancy: 0,
        averageWinningR: 1,
        averageLosingR: 1,
        medianR: 0,
        pnl: 0
      },
      {
        setupName: "Unassigned",
        closedTrades: 1,
        winRate: 0,
        rExpectancy: -0.5,
        averageWinningR: 0,
        averageLosingR: 0.5,
        medianR: -0.5,
        pnl: -50
      }
    ]);
  });

  it("keeps setup analytics period-aware", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "APRILSETUP", finalR: 1, entryDate: "2026-04-01", exitDate: "2026-04-05", setupId: 1 });

    const dashboard: Dashboard = buildDashboard(db, "this_month", dashboardToday);

    expect(dashboard.setupAnalytics).toEqual([]);
  });

  it("calculates entry method analytics from period closed trades", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "STRONGWIN", finalR: 2, entryDate: "2026-04-01", exitDate: "2026-04-05", entryMethodId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "PIVOTWIN", finalR: 1, entryDate: "2026-04-02", exitDate: "2026-04-06", entryMethodId: 2 });
    createClosedTradeWithFinalR(db, { symbol: "PIVOTLOSS", finalR: -1, entryDate: "2026-04-03", exitDate: "2026-04-07", entryMethodId: 2 });
    createClosedTradeWithFinalR(db, { symbol: "NOENTRY", finalR: -0.5, entryDate: "2026-04-04", exitDate: "2026-04-08", entryMethodId: null });

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.entryMethodAnalytics).toEqual([
      {
        entryMethodName: "Strong start entry",
        closedTrades: 1,
        winRate: 100,
        rExpectancy: 2,
        averageWinningR: 2,
        averageLosingR: 0,
        medianR: 2,
        pnl: 200
      },
      {
        entryMethodName: "Normal pivot entry",
        closedTrades: 2,
        winRate: 50,
        rExpectancy: 0,
        averageWinningR: 1,
        averageLosingR: 1,
        medianR: 0,
        pnl: 0
      },
      {
        entryMethodName: "Unassigned",
        closedTrades: 1,
        winRate: 0,
        rExpectancy: -0.5,
        averageWinningR: 0,
        averageLosingR: 0.5,
        medianR: -0.5,
        pnl: -50
      }
    ]);
  });

  it("calculates setup and entry method combination analytics", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "BREAKSTRONG", finalR: 2, entryDate: "2026-04-01", exitDate: "2026-04-05", setupId: 1, entryMethodId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "BREAKPIVOT", finalR: -1, entryDate: "2026-04-02", exitDate: "2026-04-06", setupId: 1, entryMethodId: 2 });
    createClosedTradeWithFinalR(db, { symbol: "PULLSTRONG", finalR: 1, entryDate: "2026-04-03", exitDate: "2026-04-07", setupId: 2, entryMethodId: 1 });

    const dashboard: Dashboard = buildDashboard(db, "last_month", dashboardToday);

    expect(dashboard.setupEntryMethodAnalytics.map((row) => ({
      setupName: row.setupName,
      entryMethodName: row.entryMethodName,
      closedTrades: row.closedTrades,
      rExpectancy: row.rExpectancy
    }))).toEqual([
      { setupName: "Breakout", entryMethodName: "Strong start entry", closedTrades: 1, rExpectancy: 2 },
      { setupName: "Pullback", entryMethodName: "Strong start entry", closedTrades: 1, rExpectancy: 1 },
      { setupName: "Breakout", entryMethodName: "Normal pivot entry", closedTrades: 1, rExpectancy: -1 }
    ]);
  });

  it("pages closed trade history and reports hasMore", () => {
    const db: Database.Database = createDashboardDatabase();
    Array.from({ length: 55 }, (_value, index: number) => {
      createClosedTradeWithFinalR(db, { symbol: `PAGE${index}`, finalR: 1, entryDate: "2026-04-01", exitDate: "2026-04-30" });
    });

    const firstPage = listClosedTradesPage(db, createClosedTradeFilters({ limit: 50, offset: 0 }));
    const secondPage = listClosedTradesPage(db, createClosedTradeFilters({ limit: 50, offset: 50 }));

    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.total).toBe(55);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items[0].symbol).toBe("PAGE54");
    expect(secondPage.items).toHaveLength(5);
    expect(secondPage.hasMore).toBe(false);
  });

  it("filters closed trade history by symbol, period, setup, entry method, and outcome", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "ALPHAWIN", finalR: 2, entryDate: "2026-04-01", exitDate: "2026-04-05", setupId: 1, entryMethodId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "ALPHALOSS", finalR: -1, entryDate: "2026-04-02", exitDate: "2026-04-06", setupId: 1, entryMethodId: 2 });
    createClosedTradeWithFinalR(db, { symbol: "BETAWIN", finalR: 1, entryDate: "2026-05-01", exitDate: "2026-05-02", setupId: 2, entryMethodId: 1 });
    createClosedTradeWithFinalR(db, { symbol: "ALPHABREAKEVEN", finalR: 0, entryDate: "2026-04-03", exitDate: "2026-04-07", setupId: 1, entryMethodId: 1 });

    const page = listClosedTradesPage(db, createClosedTradeFilters({
      symbol: "alpha",
      setupId: 1,
      entryMethodId: 1,
      outcome: "winners",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30"
    }));

    expect(page.items.map((trade) => trade.symbol)).toEqual(["ALPHAWIN"]);
    expect(listClosedTradesPage(db, createClosedTradeFilters({ outcome: "breakeven" })).items.map((trade) => trade.symbol)).toEqual(["ALPHABREAKEVEN"]);
  });

  it("uses the shared Monday-to-Sunday week for closed trade period filtering", () => {
    const db: Database.Database = createDashboardDatabase();
    createClosedTradeWithFinalR(db, { symbol: "BEFOREWEEK", finalR: 1, entryDate: "2026-04-20", exitDate: "2026-04-26" });
    createClosedTradeWithFinalR(db, { symbol: "OLECTRA", finalR: 1, entryDate: "2026-04-28", exitDate: "2026-04-30" });
    const period: DashboardPeriod = getDashboardPeriod("this_week", new Date("2026-05-03T00:00:00Z"));
    const page = listClosedTradesPage(db, createClosedTradeFilters({ periodStart: period.startDate, periodEnd: period.endDate }));

    expect(period.startDate).toBe("2026-04-27");
    expect(period.endDate).toBe("2026-05-03");
    expect(page.items.map((trade) => trade.symbol)).toEqual(["OLECTRA"]);
  });

  it("provides shared preset ranges for dashboard and closed trade filters", () => {
    const today: Date = new Date("2026-05-03T00:00:00Z");

    expect(getDashboardPeriod("this_week", today)).toMatchObject({ startDate: "2026-04-27", endDate: "2026-05-03" });
    expect(getDashboardPeriod("this_month", today)).toMatchObject({ startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(getDashboardPeriod("last_month", today)).toMatchObject({ startDate: "2026-04-01", endDate: "2026-04-30" });
    expect(getDashboardPeriod("current_fy", today)).toMatchObject({ startDate: "2026-04-01", endDate: "2027-03-31" });
    expect(getDashboardPeriod("last_fy", today)).toMatchObject({ startDate: "2025-04-01", endDate: "2026-03-31" });
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
    readonly setupId?: number | null;
    readonly entryMethodId?: number | null;
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
    setupId: params.setupId === undefined ? 1 : params.setupId,
    entryMethodId: params.entryMethodId === undefined ? null : params.entryMethodId,
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

function createClosedTradeFilters(overrides: Partial<Parameters<typeof listClosedTradesPage>[1]> = {}): Parameters<typeof listClosedTradesPage>[1] {
  return {
    limit: 50,
    offset: 0,
    symbol: "",
    setupId: null,
    entryMethodId: null,
    outcome: "all",
    periodStart: null,
    periodEnd: "2026-12-31",
    ...overrides
  };
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
