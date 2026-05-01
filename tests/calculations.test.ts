import { describe, expect, it } from "vitest";
import { calculateActualTradeRisk, calculateExitPnl, calculateExitRMultiple, calculateSuggestedQuantity, summarizeTrade } from "../server/src/calculations";
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
    const trade: TradeRow = {
      id: 1,
      symbol: "MTARTECH",
      market: "India",
      direction: "Buy",
      entryDate: "2026-04-07",
      entryPrice: 3685,
      quantity: 16,
      stopLoss: 3592.875,
      riskPercentage: 0.5,
      plannedRiskAmount: 2750,
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
      createExit({ id: 1, exitPrice: 4212.9, quantity: 6, pnl: 3167.4, rMultiple: 2.15 }),
      createExit({ id: 2, exitPrice: 4688.9, quantity: 5, pnl: 5019.5, rMultiple: 3.41 }),
      createExit({ id: 3, exitPrice: 5358.9, quantity: 5, pnl: 8369.5, rMultiple: 5.68 })
    ];
    expect(exits.map((exit: ExitRow) => exit.rMultiple)).toEqual([2.15, 3.41, 5.68]);
    expect(summarizeTrade(trade, exits).finalRMultiple).toBe(11.23);
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
      finalRMultiple: 0.91,
      status: "partially_exited"
    });
  });
});

function createExit(params: {
  readonly id: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly pnl: number;
  readonly rMultiple: number;
}): ExitRow {
  return {
    id: params.id,
    tradeId: 1,
    exitDate: "2026-05-01",
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
