import type Database from "better-sqlite3";
import fs from "node:fs";
import { calculateExitPnl, calculateExitRMultiple, calculatePlannedRiskAmount, summarizeTrade } from "./calculations";
import type { ExitRow, ReviewRow, ScreenshotRow, TradeRow } from "./types";

type ListItem = {
  readonly id: number;
  readonly label?: string;
  readonly name?: string;
  readonly active: number;
};

type ChecklistResponseInput = {
  readonly itemId: number;
  readonly checked: boolean;
  readonly notes: string;
};

type TradeInput = {
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly stopLoss: number;
  readonly activeStopLoss?: number;
  readonly riskPercentage: number;
  readonly riskCapitalBase: number;
  readonly setupId: number | null;
  readonly entryReason: string;
  readonly emotionalState: string;
  readonly confidence: number;
  readonly notes: string;
  readonly checklistResponses: readonly ChecklistResponseInput[];
};

type ExitInput = {
  readonly tradeId: number;
  readonly exitDate: string;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly reason: string;
  readonly emotionalState: string;
  readonly notes: string;
};

export function getSettings(db: Database.Database): Record<string, string> {
  const rows: readonly { key: string; value: string }[] = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((row: { key: string; value: string }) => [row.key, row.value]));
}

export function updateSettings(db: Database.Database, settings: Record<string, string>): Record<string, string> {
  const update = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  Object.entries(settings).forEach(([key, value]: [string, string]) => update.run(key, value));
  return getSettings(db);
}

export function getCurrentCapital(db: Database.Database): number {
  const settings: Record<string, string> = getSettings(db);
  const startingCapital: number = Number(settings.startingCapital ?? 0);
  const ledger = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM capital_ledger").get() as { total: number };
  return Number((startingCapital + ledger.total).toFixed(2));
}

export function listSetups(db: Database.Database): readonly ListItem[] {
  return db.prepare("SELECT id, name, active FROM setups ORDER BY name").all() as ListItem[];
}

export function listChecklistItems(db: Database.Database): readonly ListItem[] {
  return db.prepare("SELECT id, label, active FROM checklist_items ORDER BY id").all() as ListItem[];
}

export function listMistakeTags(db: Database.Database): readonly ListItem[] {
  return db.prepare("SELECT id, label, active FROM mistake_tags ORDER BY label").all() as ListItem[];
}

export function upsertListItem(db: Database.Database, table: string, value: string): readonly ListItem[] {
  const column: string = table === "setups" ? "name" : "label";
  db.prepare(`INSERT OR IGNORE INTO ${table} (${column}) VALUES (?)`).run(value);
  if (table === "setups") {
    return listSetups(db);
  }
  if (table === "checklist_items") {
    return listChecklistItems(db);
  }
  return listMistakeTags(db);
}

export function createTrade(db: Database.Database, input: TradeInput): number {
  const transaction = db.transaction((): number => {
    const result = db.prepare(`
      INSERT INTO trades (
        symbol, market, direction, entry_date, entry_price, quantity, stop_loss, active_stop_loss, risk_percentage,
        risk_capital_base, planned_risk_amount, setup_id, entry_reason, emotional_state, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.symbol.toUpperCase(),
      input.market,
      input.direction,
      input.entryDate,
      input.entryPrice,
      input.quantity,
      input.stopLoss,
      getActiveStopLossValue(input.activeStopLoss, input.stopLoss),
      input.riskPercentage,
      input.riskCapitalBase,
      calculatePlannedRiskAmount(input),
      input.setupId,
      input.entryReason,
      input.emotionalState,
      input.confidence,
      input.notes
    );
    const tradeId: number = Number(result.lastInsertRowid);
    const insertChecklist = db.prepare("INSERT INTO trade_checklist_responses (trade_id, item_id, checked, notes) VALUES (?, ?, ?, ?)");
    input.checklistResponses.forEach((response) => insertChecklist.run(tradeId, response.itemId, response.checked ? 1 : 0, response.notes));
    return tradeId;
  });
  return transaction();
}

export function updateTrade(db: Database.Database, tradeId: number, input: TradeInput): void {
  const transaction = db.transaction((): void => {
    const trade: TradeRow | undefined = getTrade(db, tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }
    const exits: readonly ExitRow[] = listExits(db, tradeId);
    const exitedQuantity: number = exits.reduce((total: number, exit: ExitRow) => total + exit.quantity, 0);
    if (input.quantity < exitedQuantity) {
      throw new Error("Trade quantity cannot be lower than exited quantity");
    }
    db.prepare(`
      UPDATE trades SET
        symbol = ?, market = ?, direction = ?, entry_date = ?, entry_price = ?, quantity = ?,
        stop_loss = ?, active_stop_loss = ?, risk_percentage = ?, risk_capital_base = ?, planned_risk_amount = ?, setup_id = ?,
        entry_reason = ?, emotional_state = ?, confidence = ?, notes = ?
      WHERE id = ?
    `).run(
      input.symbol.toUpperCase(),
      input.market,
      input.direction,
      input.entryDate,
      input.entryPrice,
      input.quantity,
      input.stopLoss,
      getActiveStopLossValue(input.activeStopLoss, trade.activeStopLoss),
      input.riskPercentage,
      input.riskCapitalBase,
      calculatePlannedRiskAmount(input),
      input.setupId,
      input.entryReason,
      input.emotionalState,
      input.confidence,
      input.notes,
      tradeId
    );
    replaceChecklistResponses(db, tradeId, input.checklistResponses);
    const updatedTrade: TradeRow = getRequiredTrade(db, tradeId);
    recalculateExitsAndLedger(db, updatedTrade, exits);
    updateTradeStatus(db, updatedTrade);
  });
  transaction();
}

export function listTrades(db: Database.Database, closed: boolean): readonly TradeRow[] {
  const operator: string = closed ? "=" : "!=";
  return db.prepare(`
    SELECT t.id, t.symbol, t.market, t.direction, t.entry_date AS entryDate, t.entry_price AS entryPrice,
      t.quantity, t.stop_loss AS stopLoss, t.active_stop_loss AS activeStopLoss, t.risk_percentage AS riskPercentage,
      t.risk_capital_base AS riskCapitalBase, t.planned_risk_amount AS plannedRiskAmount,
      ROUND(t.entry_price * t.quantity, 2) AS positionValue,
      CASE WHEN t.risk_capital_base > 0 THEN ROUND(((t.entry_price * t.quantity) / t.risk_capital_base) * 100, 2) ELSE 0 END AS positionSizePercentage,
      ROUND((t.entry_price - t.stop_loss) * t.quantity, 2) AS actualRisk,
      CASE WHEN t.planned_risk_amount > 0 THEN ROUND((((t.entry_price - t.stop_loss) * t.quantity) / t.planned_risk_amount) * 100, 2) ELSE 0 END AS riskUsedPercentage,
      t.setup_id AS setupId, s.name AS setupName,
      t.entry_reason AS entryReason, t.emotional_state AS emotionalState, t.confidence,
      t.notes, t.status, t.created_at AS createdAt
    FROM trades t
    LEFT JOIN setups s ON s.id = t.setup_id
    WHERE t.status ${operator} 'closed'
    ORDER BY t.entry_date DESC, t.id DESC
  `).all() as TradeRow[];
}

export function getTrade(db: Database.Database, tradeId: number): TradeRow | undefined {
  return db.prepare(`
    SELECT t.id, t.symbol, t.market, t.direction, t.entry_date AS entryDate, t.entry_price AS entryPrice,
      t.quantity, t.stop_loss AS stopLoss, t.active_stop_loss AS activeStopLoss, t.risk_percentage AS riskPercentage,
      t.risk_capital_base AS riskCapitalBase, t.planned_risk_amount AS plannedRiskAmount,
      ROUND(t.entry_price * t.quantity, 2) AS positionValue,
      CASE WHEN t.risk_capital_base > 0 THEN ROUND(((t.entry_price * t.quantity) / t.risk_capital_base) * 100, 2) ELSE 0 END AS positionSizePercentage,
      ROUND((t.entry_price - t.stop_loss) * t.quantity, 2) AS actualRisk,
      CASE WHEN t.planned_risk_amount > 0 THEN ROUND((((t.entry_price - t.stop_loss) * t.quantity) / t.planned_risk_amount) * 100, 2) ELSE 0 END AS riskUsedPercentage,
      t.setup_id AS setupId, s.name AS setupName,
      t.entry_reason AS entryReason, t.emotional_state AS emotionalState, t.confidence,
      t.notes, t.status, t.created_at AS createdAt
    FROM trades t
    LEFT JOIN setups s ON s.id = t.setup_id
    WHERE t.id = ?
  `).get(tradeId) as TradeRow | undefined;
}

export function listExits(db: Database.Database, tradeId: number): readonly ExitRow[] {
  return db.prepare(`
    SELECT id, trade_id AS tradeId, exit_date AS exitDate, exit_price AS exitPrice, quantity,
      reason, emotional_state AS emotionalState, notes, pnl, r_multiple AS rMultiple, created_at AS createdAt
    FROM trade_exits
    WHERE trade_id = ?
    ORDER BY exit_date ASC, id ASC
  `).all(tradeId) as ExitRow[];
}

export function addExit(db: Database.Database, input: ExitInput): number {
  const transaction = db.transaction((): number => {
    const trade: TradeRow | undefined = getTrade(db, input.tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }
    const existingExits: readonly ExitRow[] = listExits(db, input.tradeId);
    const summary = summarizeTrade(trade, existingExits);
    if (input.quantity <= 0 || input.quantity > summary.remainingQuantity) {
      throw new Error("Exit quantity must be within remaining quantity");
    }
    const pnl: number = calculateExitPnl(trade.entryPrice, input.exitPrice, input.quantity);
    const rMultiple: number = calculateExitRMultiple({
      pnl,
      tradeQuantity: trade.quantity,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss
    });
    const result = db.prepare(`
      INSERT INTO trade_exits (trade_id, exit_date, exit_price, quantity, reason, emotional_state, notes, pnl, r_multiple)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.tradeId, input.exitDate, input.exitPrice, input.quantity, input.reason, input.emotionalState, input.notes, pnl, rMultiple);
    const exitId: number = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO capital_ledger (entry_date, type, amount, trade_id, exit_id, notes) VALUES (?, 'realized_pnl', ?, ?, ?, ?)")
      .run(input.exitDate, pnl, input.tradeId, exitId, `Exit ${input.quantity} shares of ${trade.symbol}`);
    const updatedSummary = summarizeTrade(trade, listExits(db, input.tradeId));
    db.prepare("UPDATE trades SET status = ? WHERE id = ?").run(updatedSummary.status, input.tradeId);
    return exitId;
  });
  return transaction();
}

export function updateExit(db: Database.Database, params: {
  readonly tradeId: number;
  readonly exitId: number;
  readonly input: Omit<ExitInput, "tradeId">;
}): void {
  const transaction = db.transaction((): void => {
    const trade: TradeRow = getRequiredTrade(db, params.tradeId);
    const otherExitedQuantity: number = listExits(db, params.tradeId)
      .filter((exit: ExitRow) => exit.id !== params.exitId)
      .reduce((total: number, exit: ExitRow) => total + exit.quantity, 0);
    if (params.input.quantity <= 0 || otherExitedQuantity + params.input.quantity > trade.quantity) {
      throw new Error("Exit quantity must be within remaining quantity");
    }
    const pnl: number = calculateExitPnl(trade.entryPrice, params.input.exitPrice, params.input.quantity);
    const rMultiple: number = calculateExitRMultiple({
      pnl,
      tradeQuantity: trade.quantity,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss
    });
    const result = db.prepare(`
      UPDATE trade_exits SET exit_date = ?, exit_price = ?, quantity = ?, reason = ?,
        emotional_state = ?, notes = ?, pnl = ?, r_multiple = ?
      WHERE id = ? AND trade_id = ?
    `).run(params.input.exitDate, params.input.exitPrice, params.input.quantity, params.input.reason, params.input.emotionalState, params.input.notes, pnl, rMultiple, params.exitId, params.tradeId);
    if (result.changes === 0) {
      throw new Error("Exit not found");
    }
    upsertLedgerForExit(db, { trade, exitId: params.exitId, exitDate: params.input.exitDate, quantity: params.input.quantity, pnl });
    updateTradeStatus(db, trade);
  });
  transaction();
}

export function updateActiveStopLoss(db: Database.Database, params: {
  readonly tradeId: number;
  readonly activeStopLoss: number;
}): void {
  if (params.activeStopLoss <= 0) {
    throw new Error("Active stop must be positive");
  }
  const trade: TradeRow = getRequiredTrade(db, params.tradeId);
  if (trade.status === "closed") {
    throw new Error("Active stop can only be updated for open trades");
  }
  const result = db.prepare("UPDATE trades SET active_stop_loss = ? WHERE id = ?").run(params.activeStopLoss, params.tradeId);
  if (result.changes === 0) {
    throw new Error("Trade not found");
  }
}

function getActiveStopLossValue(activeStopLoss: number | undefined, fallback: number): number {
  const value: number = activeStopLoss ?? fallback;
  if (value <= 0) {
    throw new Error("Active stop must be positive");
  }
  return value;
}

export function backfillExitRMultiples(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT e.id, e.pnl, t.quantity AS tradeQuantity, t.entry_price AS entryPrice, t.stop_loss AS stopLoss
    FROM trade_exits e
    JOIN trades t ON t.id = e.trade_id
  `).all() as { readonly id: number; readonly pnl: number; readonly tradeQuantity: number; readonly entryPrice: number; readonly stopLoss: number }[];
  const update = db.prepare("UPDATE trade_exits SET r_multiple = ? WHERE id = ?");
  const transaction = db.transaction((): void => {
    rows.forEach((row) => {
      const rMultiple: number = calculateExitRMultiple({
        pnl: row.pnl,
        tradeQuantity: row.tradeQuantity,
        entryPrice: row.entryPrice,
        stopLoss: row.stopLoss
      });
      update.run(rMultiple, row.id);
    });
  });
  transaction();
}

export function deleteTrade(db: Database.Database, tradeId: number): void {
  const filePaths: readonly string[] = getScreenshotFilePaths(db, "trade_id = ?", [tradeId]);
  const transaction = db.transaction((): void => {
    const trade: TradeRow | undefined = getTrade(db, tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }
    db.prepare("DELETE FROM capital_ledger WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM screenshots WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM trade_mistakes WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM trade_reviews WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM trade_checklist_responses WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM trade_exits WHERE trade_id = ?").run(tradeId);
    db.prepare("DELETE FROM trades WHERE id = ?").run(tradeId);
  });
  transaction();
  deleteFiles(filePaths);
}

export function deleteExit(db: Database.Database, params: {
  readonly tradeId: number;
  readonly exitId: number;
}): void {
  const filePaths: readonly string[] = getScreenshotFilePaths(db, "trade_id = ? AND exit_id = ?", [params.tradeId, params.exitId]);
  const transaction = db.transaction((): void => {
    const trade: TradeRow | undefined = getTrade(db, params.tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }
    const result = db.prepare("DELETE FROM trade_exits WHERE id = ? AND trade_id = ?").run(params.exitId, params.tradeId);
    if (result.changes === 0) {
      throw new Error("Exit not found");
    }
    db.prepare("DELETE FROM capital_ledger WHERE trade_id = ? AND exit_id = ?").run(params.tradeId, params.exitId);
    db.prepare("DELETE FROM screenshots WHERE trade_id = ? AND exit_id = ?").run(params.tradeId, params.exitId);
    const updatedSummary = summarizeTrade(trade, listExits(db, params.tradeId));
    db.prepare("UPDATE trades SET status = ? WHERE id = ?").run(updatedSummary.status, params.tradeId);
  });
  transaction();
  deleteFiles(filePaths);
}

export function saveScreenshot(db: Database.Database, input: {
  readonly tradeId: number;
  readonly exitId: number | null;
  readonly type: "entry" | "exit";
  readonly filePath: string;
  readonly originalName: string;
}): void {
  db.prepare("INSERT INTO screenshots (trade_id, exit_id, type, file_path, original_name) VALUES (?, ?, ?, ?, ?)")
    .run(input.tradeId, input.exitId, input.type, input.filePath, input.originalName);
}

function getScreenshotFilePaths(db: Database.Database, whereClause: string, values: readonly number[]): readonly string[] {
  const rows = db.prepare(`SELECT file_path AS filePath FROM screenshots WHERE ${whereClause}`).all(...values) as { readonly filePath: string }[];
  return rows.map((row: { readonly filePath: string }) => row.filePath);
}

function deleteFiles(filePaths: readonly string[]): void {
  filePaths.forEach((filePath: string) => {
    try {
      fs.unlinkSync(filePath);
    } catch (error: unknown) {
      if (!isMissingFileError(error)) {
        console.warn(`Unable to delete screenshot file: ${filePath}`);
      }
    }
  });
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "ENOENT";
}

export function listScreenshots(db: Database.Database, tradeId: number): readonly ScreenshotRow[] {
  return db.prepare(`
    SELECT id, trade_id AS tradeId, exit_id AS exitId, type, file_path AS filePath, original_name AS originalName, created_at AS createdAt
    FROM screenshots
    WHERE trade_id = ?
    ORDER BY created_at ASC
  `).all(tradeId) as ScreenshotRow[];
}

export function listChecklistResponses(db: Database.Database, tradeId: number): readonly { readonly itemId: number; readonly checked: boolean; readonly notes: string }[] {
  const rows = db.prepare(`
    SELECT item_id AS itemId, checked, notes
    FROM trade_checklist_responses
    WHERE trade_id = ?
    ORDER BY item_id
  `).all(tradeId) as { readonly itemId: number; readonly checked: number; readonly notes: string }[];
  return rows.map((row) => ({ itemId: row.itemId, checked: row.checked === 1, notes: row.notes }));
}

export function getReview(db: Database.Database, tradeId: number): ReviewRow | undefined {
  return db.prepare(`
    SELECT trade_id AS tradeId, followed_plan AS followedPlan, rule_score AS ruleScore,
      discipline_score AS disciplineScore, went_well AS wentWell, went_wrong AS wentWrong,
      lesson, repeat_next_time AS repeatNextTime, avoid_next_time AS avoidNextTime
    FROM trade_reviews
    WHERE trade_id = ?
  `).get(tradeId) as ReviewRow | undefined;
}

export function updateReview(db: Database.Database, tradeId: number, input: Omit<ReviewRow, "tradeId"> & { readonly mistakeIds: readonly number[] }): void {
  const transaction = db.transaction((): void => {
    db.prepare(`
      INSERT INTO trade_reviews (
        trade_id, followed_plan, rule_score, discipline_score, went_well, went_wrong, lesson, repeat_next_time, avoid_next_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_id) DO UPDATE SET
        followed_plan = excluded.followed_plan,
        rule_score = excluded.rule_score,
        discipline_score = excluded.discipline_score,
        went_well = excluded.went_well,
        went_wrong = excluded.went_wrong,
        lesson = excluded.lesson,
        repeat_next_time = excluded.repeat_next_time,
        avoid_next_time = excluded.avoid_next_time,
        updated_at = CURRENT_TIMESTAMP
    `).run(tradeId, input.followedPlan, input.ruleScore, input.disciplineScore, input.wentWell, input.wentWrong, input.lesson, input.repeatNextTime, input.avoidNextTime);
    db.prepare("DELETE FROM trade_mistakes WHERE trade_id = ?").run(tradeId);
    const insertMistake = db.prepare("INSERT OR IGNORE INTO trade_mistakes (trade_id, mistake_id) VALUES (?, ?)");
    input.mistakeIds.forEach((mistakeId: number) => insertMistake.run(tradeId, mistakeId));
  });
  transaction();
}

function getRequiredTrade(db: Database.Database, tradeId: number): TradeRow {
  const trade: TradeRow | undefined = getTrade(db, tradeId);
  if (!trade) {
    throw new Error("Trade not found");
  }
  return trade;
}

function replaceChecklistResponses(db: Database.Database, tradeId: number, responses: readonly ChecklistResponseInput[]): void {
  db.prepare("DELETE FROM trade_checklist_responses WHERE trade_id = ?").run(tradeId);
  const insertChecklist = db.prepare("INSERT INTO trade_checklist_responses (trade_id, item_id, checked, notes) VALUES (?, ?, ?, ?)");
  responses.forEach((response: ChecklistResponseInput) => insertChecklist.run(tradeId, response.itemId, response.checked ? 1 : 0, response.notes));
}

function recalculateExitsAndLedger(db: Database.Database, trade: TradeRow, exits: readonly ExitRow[]): void {
  exits.forEach((exit: ExitRow) => {
    const pnl: number = calculateExitPnl(trade.entryPrice, exit.exitPrice, exit.quantity);
    const rMultiple: number = calculateExitRMultiple({
      pnl,
      tradeQuantity: trade.quantity,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss
    });
    db.prepare("UPDATE trade_exits SET pnl = ?, r_multiple = ? WHERE id = ?").run(pnl, rMultiple, exit.id);
    upsertLedgerForExit(db, { trade, exitId: exit.id, exitDate: exit.exitDate, quantity: exit.quantity, pnl });
  });
}

function upsertLedgerForExit(db: Database.Database, params: {
  readonly trade: TradeRow;
  readonly exitId: number;
  readonly exitDate: string;
  readonly quantity: number;
  readonly pnl: number;
}): void {
  const result = db.prepare(`
    UPDATE capital_ledger SET entry_date = ?, amount = ?, notes = ?
    WHERE trade_id = ? AND exit_id = ?
  `).run(params.exitDate, params.pnl, `Exit ${params.quantity} shares of ${params.trade.symbol}`, params.trade.id, params.exitId);
  if (result.changes === 0) {
    db.prepare("INSERT INTO capital_ledger (entry_date, type, amount, trade_id, exit_id, notes) VALUES (?, 'realized_pnl', ?, ?, ?, ?)")
      .run(params.exitDate, params.pnl, params.trade.id, params.exitId, `Exit ${params.quantity} shares of ${params.trade.symbol}`);
  }
}

function updateTradeStatus(db: Database.Database, trade: TradeRow): void {
  const updatedSummary = summarizeTrade(trade, listExits(db, trade.id));
  db.prepare("UPDATE trades SET status = ? WHERE id = ?").run(updatedSummary.status, trade.id);
}
