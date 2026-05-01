import type Database from "better-sqlite3";
import { calculateExitPnl, calculateExitRMultiple, summarizeTrade } from "./calculations";
import type { ExitRow, ReviewRow, ScreenshotRow, TradeRow } from "./types";

type ListItem = {
  readonly id: number;
  readonly label?: string;
  readonly name?: string;
  readonly active: number;
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

export function createTrade(db: Database.Database, input: {
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly stopLoss: number;
  readonly riskPercentage: number;
  readonly plannedRiskAmount: number;
  readonly setupId: number | null;
  readonly entryReason: string;
  readonly emotionalState: string;
  readonly confidence: number;
  readonly notes: string;
  readonly checklistResponses: readonly { readonly itemId: number; readonly checked: boolean; readonly notes: string }[];
}): number {
  const transaction = db.transaction((): number => {
    const result = db.prepare(`
      INSERT INTO trades (
        symbol, market, direction, entry_date, entry_price, quantity, stop_loss, risk_percentage,
        planned_risk_amount, setup_id, entry_reason, emotional_state, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.symbol.toUpperCase(),
      input.market,
      input.direction,
      input.entryDate,
      input.entryPrice,
      input.quantity,
      input.stopLoss,
      input.riskPercentage,
      input.plannedRiskAmount,
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

export function listTrades(db: Database.Database, closed: boolean): readonly TradeRow[] {
  const operator: string = closed ? "=" : "!=";
  return db.prepare(`
    SELECT t.id, t.symbol, t.market, t.direction, t.entry_date AS entryDate, t.entry_price AS entryPrice,
      t.quantity, t.stop_loss AS stopLoss, t.risk_percentage AS riskPercentage,
      t.planned_risk_amount AS plannedRiskAmount, t.setup_id AS setupId, s.name AS setupName,
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
      t.quantity, t.stop_loss AS stopLoss, t.risk_percentage AS riskPercentage,
      t.planned_risk_amount AS plannedRiskAmount, t.setup_id AS setupId, s.name AS setupName,
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

export function addExit(db: Database.Database, input: {
  readonly tradeId: number;
  readonly exitDate: string;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly reason: string;
  readonly emotionalState: string;
  readonly notes: string;
}): number {
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

export function listScreenshots(db: Database.Database, tradeId: number): readonly ScreenshotRow[] {
  return db.prepare(`
    SELECT id, trade_id AS tradeId, exit_id AS exitId, type, file_path AS filePath, original_name AS originalName, created_at AS createdAt
    FROM screenshots
    WHERE trade_id = ?
    ORDER BY created_at ASC
  `).all(tradeId) as ScreenshotRow[];
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
