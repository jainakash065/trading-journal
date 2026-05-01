import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../server/src/db";
import { addExit, createTrade, getCurrentCapital, getTrade, listChecklistResponses, listExits, listScreenshots, saveScreenshot, updateExit, updateTrade } from "../server/src/repository";

describe("edit flows", () => {
  it("infers risk capital base for existing trades", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    db.prepare("UPDATE trades SET risk_percentage = 0.5, planned_risk_amount = 2750, risk_capital_base = 0 WHERE id = ?").run(tradeId);
    initializeDatabase(db);
    const trade = getTrade(db, tradeId);
    expect(trade?.riskCapitalBase).toBe(550000);
    expect(trade?.plannedRiskAmount).toBe(2750);
  });

  it("editing risk percent derives planned risk without changing actual risk or r", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    addExit(db, createExitInput({ tradeId, exitPrice: 120, quantity: 5 }));
    updateTrade(db, tradeId, {
      symbol: "TEST",
      market: "India",
      direction: "Buy",
      entryDate: "2026-05-01",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 90,
      riskPercentage: 0.5,
      riskCapitalBase: 550000,
      setupId: 1,
      entryReason: "",
      emotionalState: "",
      confidence: 3,
      notes: "",
      checklistResponses: []
    });
    const before = getTrade(db, tradeId);
    const beforeExit = listExits(db, tradeId)[0];
    updateTrade(db, tradeId, {
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
      entryReason: "",
      emotionalState: "",
      confidence: 3,
      notes: "",
      checklistResponses: []
    });
    const after = getTrade(db, tradeId);
    const afterExit = listExits(db, tradeId)[0];
    expect(before?.plannedRiskAmount).toBe(2750);
    expect(after?.plannedRiskAmount).toBe(5500);
    expect(after?.actualRisk).toBe(before?.actualRisk);
    expect(afterExit.pnl).toBe(beforeExit.pnl);
    expect(afterExit.rMultiple).toBe(beforeExit.rMultiple);
  });

  it("recalculates exits, ledger, and checklist when entry fields change", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    addExit(db, createExitInput({ tradeId, exitPrice: 120, quantity: 5 }));
    updateTrade(db, tradeId, {
      symbol: "EDITED",
      market: "India",
      direction: "Buy",
      entryDate: "2026-05-01",
      entryPrice: 105,
      quantity: 10,
      stopLoss: 95,
      riskPercentage: 1,
      riskCapitalBase: 550000,
      setupId: 1,
      entryReason: "Edited setup",
      emotionalState: "Calm",
      confidence: 4,
      notes: "Edited",
      checklistResponses: [{ itemId: 1, checked: false, notes: "" }]
    });
    const exit = listExits(db, tradeId)[0];
    expect(getTrade(db, tradeId)?.symbol).toBe("EDITED");
    expect(exit.pnl).toBe(75);
    expect(exit.rMultiple).toBe(0.75);
    expect(getCurrentCapital(db)).toBe(550075);
    expect(listChecklistResponses(db, tradeId)[0]?.checked).toBe(false);
  });

  it("rejects entry quantity below already exited quantity", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    addExit(db, createExitInput({ tradeId, exitPrice: 120, quantity: 8 }));
    expect(() => updateTrade(db, tradeId, {
      symbol: "TEST",
      market: "India",
      direction: "Buy",
      entryDate: "2026-05-01",
      entryPrice: 100,
      quantity: 7,
      stopLoss: 90,
      riskPercentage: 1,
      riskCapitalBase: 550000,
      setupId: 1,
      entryReason: "",
      emotionalState: "",
      confidence: 3,
      notes: "",
      checklistResponses: []
    })).toThrow("Trade quantity cannot be lower than exited quantity");
  });

  it("updates one exit and rejects quantities above availability", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    const firstExitId: number = addExit(db, createExitInput({ tradeId, exitPrice: 120, quantity: 5 }));
    addExit(db, createExitInput({ tradeId, exitPrice: 130, quantity: 3 }));
    expect(() => updateExit(db, {
      tradeId,
      exitId: firstExitId,
      input: { exitDate: "2026-05-03", exitPrice: 125, quantity: 8, reason: "", emotionalState: "", notes: "" }
    })).toThrow("Exit quantity must be within remaining quantity");
    updateExit(db, {
      tradeId,
      exitId: firstExitId,
      input: { exitDate: "2026-05-04", exitPrice: 125, quantity: 6, reason: "Edited", emotionalState: "Fine", notes: "Corrected" }
    });
    const exit = listExits(db, tradeId).find((row) => row.id === firstExitId);
    expect(exit?.exitDate).toBe("2026-05-04");
    expect(exit?.pnl).toBe(150);
    expect(exit?.rMultiple).toBe(1.5);
    expect(getTrade(db, tradeId)?.status).toBe("partially_exited");
  });

  it("appends screenshot metadata during edit flow without deleting existing screenshots", () => {
    const db: Database.Database = createTestDatabase();
    const tradeId: number = createTestTrade(db);
    const firstPath: string = createTempFile("first.png");
    const secondPath: string = createTempFile("second.png");
    saveScreenshot(db, { tradeId, exitId: null, type: "entry", filePath: firstPath, originalName: "first.png" });
    updateTrade(db, tradeId, {
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
      entryReason: "",
      emotionalState: "",
      confidence: 3,
      notes: "",
      checklistResponses: []
    });
    saveScreenshot(db, { tradeId, exitId: null, type: "entry", filePath: secondPath, originalName: "second.png" });
    expect(listScreenshots(db, tradeId)).toHaveLength(2);
    expect(fs.existsSync(firstPath)).toBe(true);
    expect(fs.existsSync(secondPath)).toBe(true);
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
    entryReason: "Test setup",
    emotionalState: "",
    confidence: 3,
    notes: "",
    checklistResponses: [{ itemId: 1, checked: true, notes: "" }]
  });
}

function createExitInput(params: {
  readonly tradeId: number;
  readonly exitPrice: number;
  readonly quantity: number;
}) {
  return {
    tradeId: params.tradeId,
    exitDate: "2026-05-02",
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    reason: "",
    emotionalState: "",
    notes: ""
  };
}

function createTempFile(fileName: string): string {
  const folderPath: string = fs.mkdtempSync(path.join(os.tmpdir(), "trading-journal-edit-test-"));
  const filePath: string = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, "screenshot");
  return filePath;
}
