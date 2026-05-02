import type { Dashboard, DashboardPeriodKey, LastNTradeCount, ReferenceItem, Settings, Trade } from "./types";

export type ReferenceData = {
  readonly setups: readonly ReferenceItem[];
  readonly entryMethods: readonly ReferenceItem[];
  readonly checklistItems: readonly ReferenceItem[];
  readonly mistakeTags: readonly ReferenceItem[];
};

export async function apiGet<T>(path: string): Promise<T> {
  const response: Response = await fetch(path);
  return parseResponse<T>(response);
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const response: Response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
  const response: Response = await fetch(path, { method: "DELETE" });
  await parseResponse<{ readonly ok: boolean }>(response);
}

export async function uploadScreenshot(path: string, file: File): Promise<void> {
  const body: FormData = new FormData();
  body.append("screenshot", file);
  const response: Response = await fetch(path, { method: "POST", body });
  await parseResponse<{ readonly ok: boolean }>(response);
}

export const endpoints = {
  dashboard: (period: DashboardPeriodKey, lastN: LastNTradeCount) => `/api/dashboard?period=${period}&lastN=${lastN}`,
  settings: "/api/settings",
  referenceData: "/api/reference-data",
  openTrades: "/api/trades?status=open",
  closedTrades: "/api/trades?status=closed"
} as const;

export type AppData = {
  readonly dashboard: Dashboard;
  readonly settings: Settings;
  readonly referenceData: ReferenceData;
  readonly openTrades: readonly Trade[];
  readonly closedTrades: readonly Trade[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  const json: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(json));
  }
  return json as T;
}

function getErrorMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { readonly message?: unknown }).message;
    return typeof message === "string" ? message : "Request failed";
  }
  return "Request failed";
}
