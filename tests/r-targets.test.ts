import { describe, expect, it } from "vitest";
import { calculateCompletedRLevel, generateRTargetRows } from "../client/src/r-targets";

describe("R target rows", () => {
  it("generates target price and move percentage for each R level", () => {
    const rows = generateRTargetRows({ entryPrice: 100, stopLoss: 95 });

    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual({ rLevel: 1, movePercentage: 5, price: 105 });
    expect(rows[24]).toEqual({ rLevel: 25, movePercentage: 125, price: 225 });
  });

  it("returns no targets when initial risk is not positive", () => {
    expect(generateRTargetRows({ entryPrice: 100, stopLoss: 100 })).toEqual([]);
    expect(generateRTargetRows({ entryPrice: 100, stopLoss: 105 })).toEqual([]);
    expect(generateRTargetRows({ entryPrice: 0, stopLoss: 95 })).toEqual([]);
  });

  it("calculates the completed R level from current price", () => {
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 108 })).toBe(3);
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 107.5 })).toBe(3);
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 200 })).toBe(25);
  });

  it("does not highlight when current price has not completed 1R", () => {
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: null })).toBeNull();
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 100 })).toBeNull();
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 99 })).toBeNull();
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 97.5, currentPrice: 102 })).toBeNull();
    expect(calculateCompletedRLevel({ entryPrice: 100, stopLoss: 100, currentPrice: 120 })).toBeNull();
  });
});
