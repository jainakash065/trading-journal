import { describe, expect, it } from "vitest";
import { calculateExitPnl, calculateExitRMultiple, calculateSuggestedQuantity, summarizeTrade } from "../server/src/calculations";
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

  it("calculates partial exit pnl and r multiple", () => {
    const pnl: number = calculateExitPnl(500, 550, 100);
    expect(pnl).toBe(5000);
    expect(calculateExitRMultiple({
      pnl,
      tradeQuantity: 220,
      exitQuantity: 100,
      plannedRiskAmount: 5500
    })).toBe(2);
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
      riskPercentage: 1,
      plannedRiskAmount: 5500,
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
      averageExitPrice: 550,
      finalRMultiple: 2,
      status: "partially_exited"
    });
  });
});
