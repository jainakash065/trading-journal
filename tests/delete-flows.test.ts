import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../server/src/db";
import { addExit, createTrade, deleteExit, deleteTrade, getCurrentCapital, getTrade, listExits, listScreenshots, saveScreenshot, updateReview } from "../server/src/repository";

describe("delete flows", () => {
  it("deletes one exit, its ledger entry, screenshots, and restores open status", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    const exitId: number = addExit(db, {
      tradeId,
      exitDate: "2026-05-02",
      exitPrice: 120,
      quantity: 5,
      reason: "Mistake",
      emotionalState: "",
      notes: ""
    });
    const screenshotPath: string = createTempFile("exit.png");
    saveScreenshot(db, { tradeId, exitId, type: "exit", filePath: screenshotPath, originalName: "exit.png" });
    deleteExit(db, { tradeId, exitId });
    expect(listExits(db, tradeId)).toHaveLength(0);
    expect(listScreenshots(db, tradeId)).toHaveLength(0);
    expect(getCurrentCapital(db)).toBe(550000);
    expect(getTrade(db, tradeId)?.status).toBe("open");
    expect(fs.existsSync(screenshotPath)).toBe(false);
  });

  it("deletes a trade with related metadata and ignores missing screenshot files", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    const firstExitId: number = addExit(db, {
      tradeId,
      exitDate: "2026-05-02",
      exitPrice: 120,
      quantity: 5,
      reason: "",
      emotionalState: "",
      notes: ""
    });
    const entryScreenshotPath: string = createTempFile("entry.png");
    const missingScreenshotPath: string = path.join(os.tmpdir(), `missing-${Date.now()}.png`);
    saveScreenshot(db, { tradeId, exitId: null, type: "entry", filePath: entryScreenshotPath, originalName: "entry.png" });
    saveScreenshot(db, { tradeId, exitId: firstExitId, type: "exit", filePath: missingScreenshotPath, originalName: "missing.png" });
    updateReview(db, tradeId, {
      followedPlan: 1,
      ruleScore: 8,
      disciplineScore: 8,
      wentWell: "",
      wentWrong: "",
      lesson: "Cleanup test",
      repeatNextTime: "",
      avoidNextTime: "",
      mistakeIds: [1]
    });
    deleteTrade(db, tradeId);
    expect(getTrade(db, tradeId)).toBeUndefined();
    expect(countRows(db, "trade_exits")).toBe(0);
    expect(countRows(db, "capital_ledger")).toBe(0);
    expect(countRows(db, "screenshots")).toBe(0);
    expect(countRows(db, "trade_reviews")).toBe(0);
    expect(countRows(db, "trade_mistakes")).toBe(0);
    expect(countRows(db, "trade_checklist_responses")).toBe(0);
    expect(fs.existsSync(entryScreenshotPath)).toBe(false);
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
    plannedRiskAmount: 5500,
    setupId: 1,
    entryReason: "Test setup",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: [{ itemId: 1, checked: true, notes: "" }]
  });
}

function createTempFile(fileName: string): string {
  const folderPath: string = fs.mkdtempSync(path.join(os.tmpdir(), "trading-journal-test-"));
  const filePath: string = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, "screenshot");
  return filePath;
}

function countRows(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { readonly count: number };
  return row.count;
}
