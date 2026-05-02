import cors from "cors";
import express, { type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { buildDashboard, parseDashboardPeriodKey, parseLastNTradeCount, type DashboardPeriodKey } from "./dashboard";
import { createDatabase } from "./db";
import { entryScreenshotDir, exitScreenshotDir } from "./paths";
import {
  addExit,
  createTrade,
  deleteExit,
  deleteTrade,
  getCurrentCapital,
  getReview,
  getSettings,
  getTrade,
  listClosedTradesPage,
  listChecklistItems,
  listEntryMethods,
  listChecklistResponses,
  listExits,
  listMistakeTags,
  listScreenshots,
  listSetups,
  listTrades,
  saveScreenshot,
  updateExit,
  updateActiveStopLoss,
  updateCurrentPrice,
  updateReview,
  updateSettings,
  updateTrade,
  upsertListItem,
  type ClosedTradeOutcome
} from "./repository";
import { calculateSuggestedQuantity, summarizeTrade } from "./calculations";

const db = createDatabase();
const defaultClosedTradeLimit = 50;

const tradeSchema = z.object({
  symbol: z.string().min(1),
  market: z.string().min(1),
  direction: z.string().min(1),
  entryDate: z.string().min(1),
  entryPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  stopLoss: z.coerce.number().positive(),
  activeStopLoss: z.coerce.number().positive().optional(),
  currentPrice: z.coerce.number().positive().nullable().optional(),
  riskPercentage: z.coerce.number().nonnegative(),
  riskCapitalBase: z.coerce.number().nonnegative(),
  setupId: z.coerce.number().int().nullable(),
  entryMethodId: z.coerce.number().int().nullable().default(null),
  entryReason: z.string().default(""),
  emotionalState: z.string().default(""),
  confidence: z.coerce.number().int().min(1).max(5),
  notes: z.string().default(""),
  checklistResponses: z.array(z.object({
    itemId: z.coerce.number().int(),
    checked: z.boolean(),
    notes: z.string().default("")
  })).default([])
});

const exitSchema = z.object({
  exitDate: z.string().min(1),
  exitPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().default(""),
  emotionalState: z.string().default(""),
  notes: z.string().default("")
});

const activeStopSchema = z.object({
  activeStopLoss: z.coerce.number().positive()
});

const currentPriceSchema = z.object({
  currentPrice: z.coerce.number().positive()
});

const reviewSchema = z.object({
  followedPlan: z.coerce.number().int().min(0).max(1),
  ruleScore: z.coerce.number().int().min(1).max(10),
  disciplineScore: z.coerce.number().int().min(1).max(10),
  wentWell: z.string().default(""),
  wentWrong: z.string().default(""),
  lesson: z.string().default(""),
  repeatNextTime: z.string().default(""),
  avoidNextTime: z.string().default(""),
  mistakeIds: z.array(z.coerce.number().int()).default([])
});

function createUpload(folder: string): multer.Multer {
  return multer({
    storage: multer.diskStorage({
      destination: folder,
      filename: (_request, file, callback): void => {
        const safeName: string = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-");
        callback(null, `${Date.now()}-${safeName}`);
      }
    })
  });
}

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/uploads/entries", express.static(entryScreenshotDir));
  app.use("/uploads/exits", express.static(exitScreenshotDir));
  app.get("/api/health", (_request: Request, response: Response) => response.json({ ok: true }));
  app.get("/api/settings", (_request: Request, response: Response) => response.json({ ...getSettings(db), currentCapital: getCurrentCapital(db) }));
  app.put("/api/settings", (request: Request, response: Response) => response.json(updateSettings(db, request.body as Record<string, string>)));
  app.get("/api/reference-data", (_request: Request, response: Response) => response.json({
    setups: listSetups(db),
    entryMethods: listEntryMethods(db),
    checklistItems: listChecklistItems(db),
    mistakeTags: listMistakeTags(db)
  }));
  app.post("/api/reference-data/:type", (request: Request, response: Response) => {
    const type = request.params.type;
    const value: string = String(request.body.value ?? "").trim();
    const table = type === "setups" ? "setups" : type === "entry-methods" ? "entry_methods" : type === "checklist" ? "checklist_items" : "mistake_tags";
    response.json(upsertListItem(db, table, value));
  });
  app.get("/api/risk/suggested-quantity", (request: Request, response: Response) => {
    response.json({
      quantity: calculateSuggestedQuantity({
        capital: getCurrentCapital(db),
        riskPercentage: Number(request.query.riskPercentage ?? 0),
        entryPrice: Number(request.query.entryPrice ?? 0),
        stopLoss: Number(request.query.stopLoss ?? 0)
      })
    });
  });
  app.get("/api/trades", (request: Request, response: Response) => {
    if (request.query.status === "closed") {
      const filters = parseClosedTradeFilters(request.query);
      const page = listClosedTradesPage(db, filters);
      response.json({
        ...page,
        items: page.items.map((trade) => {
          const exits = listExits(db, trade.id);
          return { ...trade, summary: summarizeTrade(trade, exits) };
        })
      });
      return;
    }
    response.json(listTrades(db, false).map((trade) => {
      const exits = listExits(db, trade.id);
      return { ...trade, summary: summarizeTrade(trade, exits) };
    }));
  });
  app.post("/api/trades", (request: Request, response: Response) => {
    const input = tradeSchema.parse(request.body);
    const id = createTrade(db, input);
    response.status(201).json({ id });
  });
  app.get("/api/trades/:id", (request: Request, response: Response) => {
    const tradeId: number = Number(request.params.id);
    const trade = getTrade(db, tradeId);
    if (!trade) {
      response.status(404).json({ message: "Trade not found" });
      return;
    }
    const exits = listExits(db, tradeId);
    response.json({
      trade,
      exits,
      summary: summarizeTrade(trade, exits),
      screenshots: listScreenshots(db, tradeId).map((screenshot) => ({
        ...screenshot,
        url: `/uploads/${screenshot.type === "entry" ? "entries" : "exits"}/${path.basename(screenshot.filePath)}`
      })),
      checklistResponses: listChecklistResponses(db, tradeId),
      review: getReview(db, tradeId)
    });
  });
  app.put("/api/trades/:id", (request: Request, response: Response) => {
    updateTrade(db, Number(request.params.id), tradeSchema.parse(request.body));
    response.json({ ok: true });
  });
  app.patch("/api/trades/:id/active-stop", (request: Request, response: Response) => {
    updateActiveStopLoss(db, { tradeId: Number(request.params.id), ...activeStopSchema.parse(request.body) });
    response.json({ ok: true });
  });
  app.patch("/api/trades/:id/current-price", (request: Request, response: Response) => {
    updateCurrentPrice(db, { tradeId: Number(request.params.id), ...currentPriceSchema.parse(request.body) });
    response.json({ ok: true });
  });
  app.post("/api/trades/:id/exits", (request: Request, response: Response) => {
    const id = addExit(db, { tradeId: Number(request.params.id), ...exitSchema.parse(request.body) });
    response.status(201).json({ id });
  });
  app.put("/api/trades/:id/exits/:exitId", (request: Request, response: Response) => {
    updateExit(db, { tradeId: Number(request.params.id), exitId: Number(request.params.exitId), input: exitSchema.parse(request.body) });
    response.json({ ok: true });
  });
  app.delete("/api/trades/:id", (request: Request, response: Response) => {
    deleteTrade(db, Number(request.params.id));
    response.json({ ok: true });
  });
  app.delete("/api/trades/:id/exits/:exitId", (request: Request, response: Response) => {
    deleteExit(db, { tradeId: Number(request.params.id), exitId: Number(request.params.exitId) });
    response.json({ ok: true });
  });
  app.put("/api/trades/:id/review", (request: Request, response: Response) => {
    updateReview(db, Number(request.params.id), reviewSchema.parse(request.body));
    response.json({ ok: true });
  });
  app.post("/api/trades/:id/screenshots/entry", createUpload(entryScreenshotDir).single("screenshot"), (request: Request, response: Response) => {
    if (!request.file) {
      response.status(400).json({ message: "Screenshot is required" });
      return;
    }
    saveScreenshot(db, { tradeId: Number(request.params.id), exitId: null, type: "entry", filePath: request.file.path, originalName: request.file.originalname });
    response.status(201).json({ ok: true });
  });
  app.post("/api/trades/:id/exits/:exitId/screenshots", createUpload(exitScreenshotDir).single("screenshot"), (request: Request, response: Response) => {
    if (!request.file) {
      response.status(400).json({ message: "Screenshot is required" });
      return;
    }
    saveScreenshot(db, { tradeId: Number(request.params.id), exitId: Number(request.params.exitId), type: "exit", filePath: request.file.path, originalName: request.file.originalname });
    response.status(201).json({ ok: true });
  });
  app.get("/api/dashboard", (request: Request, response: Response) => {
    response.json(buildDashboard(db, parseDashboardPeriodKey(request.query.period), new Date(), parseLastNTradeCount(request.query.lastN)));
  });
  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    const message: string = error instanceof Error ? error.message : "Unexpected server error";
    response.status(400).json({ message });
  });
  return app;
}

function parseClosedTradeFilters(query: Request["query"]): {
  readonly limit: number;
  readonly offset: number;
  readonly symbol: string;
  readonly setupId: number | null;
  readonly entryMethodId: number | null;
  readonly outcome: ClosedTradeOutcome;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
} {
  const periodRange = getClosedTradePeriodRange(parseDashboardPeriodKey(query.period));
  return {
    limit: getPositiveInteger(query.limit, defaultClosedTradeLimit),
    offset: getNonNegativeInteger(query.offset),
    symbol: typeof query.symbol === "string" ? query.symbol : "",
    setupId: getNullableInteger(query.setupId),
    entryMethodId: getNullableInteger(query.entryMethodId),
    outcome: parseClosedTradeOutcome(query.outcome),
    periodStart: periodRange.startDate,
    periodEnd: periodRange.endDate
  };
}

function getPositiveInteger(value: unknown, fallback: number): number {
  const parsed: number = typeof value === "string" ? Number(value) : fallback;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

function getNonNegativeInteger(value: unknown): number {
  const parsed: number = typeof value === "string" ? Number(value) : 0;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function getNullableInteger(value: unknown): number | null {
  const parsed: number = typeof value === "string" && value !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function parseClosedTradeOutcome(value: unknown): ClosedTradeOutcome {
  return value === "winners" || value === "losers" || value === "breakeven" ? value : "all";
}

function getClosedTradePeriodRange(periodKey: DashboardPeriodKey): { readonly startDate: string | null; readonly endDate: string | null } {
  const today: Date = new Date();
  const year: number = today.getFullYear();
  const month: number = today.getMonth();
  if (periodKey === "all_time") {
    return { startDate: null, endDate: null };
  }
  if (periodKey === "this_week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { startDate: formatDate(start), endDate: formatDate(today) };
  }
  if (periodKey === "this_month") {
    return { startDate: formatDate(new Date(year, month, 1)), endDate: formatDate(today) };
  }
  if (periodKey === "last_month") {
    return { startDate: formatDate(new Date(year, month - 1, 1)), endDate: formatDate(new Date(year, month, 0)) };
  }
  const currentFyStartYear: number = month >= 3 ? year : year - 1;
  if (periodKey === "current_fy") {
    return { startDate: formatDate(new Date(currentFyStartYear, 3, 1)), endDate: formatDate(new Date(currentFyStartYear + 1, 2, 31)) };
  }
  return { startDate: formatDate(new Date(currentFyStartYear - 1, 3, 1)), endDate: formatDate(new Date(currentFyStartYear, 2, 31)) };
}

function formatDate(value: Date): string {
  const year: number = value.getFullYear();
  const month: string = String(value.getMonth() + 1).padStart(2, "0");
  const day: string = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
