import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../server/src/db";
import { createTrade, getReview, updateReview } from "../server/src/repository";

describe("review flows", () => {
  it("returns saved review scores and mistake ids for trade detail hydration", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    updateReview(db, tradeId, {
      followedPlan: 0,
      ruleScore: 3,
      disciplineScore: 2,
      wentWell: "",
      wentWrong: "Did not follow plan",
      lesson: "Wait for confirmation",
      repeatNextTime: "",
      avoidNextTime: "Early exit",
      mistakeIds: [1, 2]
    });
    expect(getReview(db, tradeId)).toEqual({
      tradeId,
      followedPlan: 0,
      ruleScore: 3,
      disciplineScore: 2,
      wentWell: "",
      wentWrong: "Did not follow plan",
      lesson: "Wait for confirmation",
      repeatNextTime: "",
      avoidNextTime: "Early exit",
      mistakeIds: [1, 2]
    });
  });

  it("does not create a review row for an unreviewed trade", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    expect(getReview(db, tradeId)).toBeUndefined();
  });
});

function createTestDatabase(): Database.Database {
  const db: Database.Database = new Database(":memory:");
  initializeDatabase(db);
  return db;
}

function createTestTrade(db: Database.Database): number {
  return createTrade(db, {
    symbol: "TEST",
    market: "India",
    direction: "Buy",
    entryDate: "2026-05-01",
    entryPrice: 100,
    quantity: 10,
    stopLoss: 90,
    riskPercentage: 1,
    riskCapitalBase: 550000,
    setupId: 1,
    entryReason: "Review test",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: []
  });
}
