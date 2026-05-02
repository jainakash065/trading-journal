import { describe, expect, it } from "vitest";
import {
  calculateActualTradeRisk,
  calculateExitPnl,
  calculateExitRMultiple,
  calculateInclusiveDurationDays,
  calculatePortfolioImpactPercentage,
  calculatePositionSizePercentage,
  calculatePositionValue,
  calculateSuggestedQuantity,
  calculateStopLossPercentageFromPrice,
  calculateStopLossPriceFromPercentage,
  summarizeTrade
} from "../server/src/calculations";
import type { ExitRow, TradeRow } from "../server/src/types";

describe("trading calculations", () => {
  it("suggests quantity from percentage risk", () => {
    expect(calculateSuggestedQuantity({
      capital: 550000,
      riskPercentage: 1,
      entryPrice: 500,
      stopLoss: 475
    })).toBe(220);
  });

  it("converts stop loss between percentage and price", () => {
    expect(calculateStopLossPriceFromPercentage({
      entryPrice: 100,
      stopLossPercentage: 5
    })).toBe(95);
    expect(calculateStopLossPercentageFromPrice({
      entryPrice: 100,
      stopLoss: 92
    })).toBe(8);
    expect(calculateStopLossPriceFromPercentage({
      entryPrice: 0,
      stopLossPercentage: 5
    })).toBeNull();
    expect(calculateStopLossPercentageFromPrice({
      entryPrice: 0,
      stopLoss: 92
    })).toBeNull();
  });

  it("calculates inclusive trade duration", () => {
    expect(calculateInclusiveDurationDays({
      entryDate: "2026-04-07",
      exitDate: "2026-04-23"
    })).toBe(17);
    expect(calculateInclusiveDurationDays({
      entryDate: "2026-04-07",
      exitDate: "2026-04-07"
    })).toBe(1);
  });

  it("calculates partial exit pnl and r multiple", () => {
    const pnl: number = calculateExitPnl(500, 550, 100);
    expect(pnl).toBe(5000);
    expect(calculateExitRMultiple({
      pnl,
      tradeQuantity: 220,
      entryPrice: 500,
      stopLoss: 475
    })).toBe(0.91);
  });

  it("calculates trade r from actual position risk", () => {
    expect(calculateActualTradeRisk({
      entryPrice: 3685,
      stopLoss: 3592.875,
      quantity: 16
    })).toBe(1474);
    expect(calculatePositionValue(3685, 16)).toBe(58960);
    expect(calculatePositionSizePercentage({
      positionValue: 58960,
      riskCapitalBase: 550000
    })).toBe(10.72);
    expect(calculatePositionSizePercentage({
      positionValue: 58960,
      riskCapitalBase: 0
    })).toBe(0);
    expect(calculatePortfolioImpactPercentage({
      realizedPnl: 16556.4,
      riskCapitalBase: 550000
    })).toBe(3.01);
    expect(calculatePortfolioImpactPercentage({
      realizedPnl: -6875,
      riskCapitalBase: 550000
    })).toBe(-1.25);
    expect(calculatePortfolioImpactPercentage({
      realizedPnl: 16556.4,
      riskCapitalBase: 0
    })).toBe(0);
    const trade: TradeRow = {
      id: 1,
      symbol: "MTARTECH",
      market: "India",
      direction: "Buy",
      entryDate: "2026-04-07",
      entryPrice: 3685,
      quantity: 16,
      stopLoss: 3592.875,
      activeStopLoss: 3592.875,
      riskPercentage: 0.5,
      riskCapitalBase: 550000,
      plannedRiskAmount: 2750,
      positionValue: 58960,
      positionSizePercentage: 10.72,
      actualRisk: 1474,
      riskUsedPercentage: 53.6,
      setupId: null,
      setupName: null,
      entryReason: "",
      emotionalState: "",
      confidence: 5,
      notes: "",
      status: "closed",
      createdAt: "2026-05-01"
    };
    const exits: readonly ExitRow[] = [
      createExit({ id: 1, exitDate: "2026-04-09", exitPrice: 4212.9, quantity: 6, pnl: 3167.4, rMultiple: 2.15 }),
      createExit({ id: 2, exitDate: "2026-04-15", exitPrice: 4688.9, quantity: 5, pnl: 5019.5, rMultiple: 3.41 }),
      createExit({ id: 3, exitDate: "2026-04-23", exitPrice: 5358.9, quantity: 5, pnl: 8369.5, rMultiple: 5.68 })
    ];
    expect(exits.map((exit: ExitRow) => exit.rMultiple)).toEqual([2.15, 3.41, 5.68]);
    expect(summarizeTrade(trade, exits)).toMatchObject({
      finalRMultiple: 11.23,
      portfolioImpactPercentage: 3.01,
      durationDays: 17
    });
  });

  it("summarizes partially exited trades", () => {
    const trade: TradeRow = {
      id: 1,
      symbol: "RELIANCE",
      market: "India",
      direction: "Buy",
      entryDate: "2026-05-01",
      entryPrice: 500,
      quantity: 220,
      stopLoss: 475,
      activeStopLoss: 475,
      riskPercentage: 1,
      riskCapitalBase: 550000,
      plannedRiskAmount: 5500,
      positionValue: 110000,
      positionSizePercentage: 20,
      actualRisk: 5500,
      riskUsedPercentage: 100,
      setupId: null,
      setupName: null,
      entryReason: "",
      emotionalState: "",
      confidence: 3,
      notes: "",
      status: "open",
      createdAt: "2026-05-01"
    };
    const exits: readonly ExitRow[] = [{
      id: 1,
      tradeId: 1,
      exitDate: "2026-05-03",
      exitPrice: 550,
      quantity: 100,
      reason: "",
      emotionalState: "",
      notes: "",
      pnl: 5000,
      rMultiple: 2,
      createdAt: "2026-05-03"
    }];
    expect(summarizeTrade(trade, exits)).toMatchObject({
      exitedQuantity: 100,
      remainingQuantity: 120,
      realizedPnl: 5000,
      portfolioImpactPercentage: 0.91,
      averageExitPrice: 550,
      finalRMultiple: 0.91,
      durationDays: 0,
      status: "partially_exited"
    });
  });
});

function createExit(params: {
  readonly id: number;
  readonly exitDate?: string;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly pnl: number;
  readonly rMultiple: number;
}): ExitRow {
  return {
    id: params.id,
    tradeId: 1,
    exitDate: params.exitDate ?? "2026-05-01",
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    reason: "",
    emotionalState: "",
    notes: "",
    pnl: params.pnl,
    rMultiple: params.rMultiple,
    createdAt: "2026-05-01"
  };
}
