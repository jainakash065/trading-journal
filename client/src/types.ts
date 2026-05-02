export type ReferenceItem = {
  readonly id: number;
  readonly name?: string;
  readonly label?: string;
  readonly active: number;
};

export type Settings = {
  readonly startingCapital: string;
  readonly defaultMarket: string;
  readonly defaultDirection: string;
  readonly defaultRiskPercentage: string;
  readonly currentCapital: number;
};

export type TradeSummary = {
  readonly exitedQuantity: number;
  readonly remainingQuantity: number;
  readonly realizedPnl: number;
  readonly portfolioImpactPercentage: number;
  readonly averageExitPrice: number;
  readonly finalRMultiple: number;
  readonly durationDays: number;
  readonly status: string;
};

export type Trade = {
  readonly id: number;
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly stopLoss: number;
  readonly riskPercentage: number;
  readonly riskCapitalBase: number;
  readonly plannedRiskAmount: number;
  readonly positionValue: number;
  readonly positionSizePercentage: number;
  readonly actualRisk: number;
  readonly riskUsedPercentage: number;
  readonly setupId: number | null;
  readonly setupName: string | null;
  readonly entryReason: string;
  readonly emotionalState: string;
  readonly confidence: number;
  readonly notes: string;
  readonly status: string;
  readonly summary: TradeSummary;
};

export type TradeExit = {
  readonly id: number;
  readonly exitDate: string;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly reason: string;
  readonly emotionalState: string;
  readonly notes: string;
  readonly pnl: number;
  readonly rMultiple: number;
};

export type DashboardPeriodKey = "all_time" | "current_fy" | "last_fy" | "this_month" | "last_month" | "this_week";

export type DashboardPeriod = {
  readonly key: DashboardPeriodKey;
  readonly label: string;
  readonly startDate: string | null;
  readonly endDate: string;
};

export type Dashboard = {
  readonly period: DashboardPeriod;
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly totalRealizedPnl: number;
  readonly periodStartingCapital: number;
  readonly periodEndingCapital: number;
  readonly periodCapitalChange: number;
  readonly periodCapitalChangePercentage: number;
  readonly periodPnl: number;
  readonly periodClosedTrades: number;
  readonly winRate: number;
  readonly averageWinner: number;
  readonly averageLoser: number;
  readonly profitFactor: number;
  readonly averageR: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly openTrades: number;
  readonly openRiskExposure: number;
  readonly bestSetup: string;
  readonly worstSetup: string;
  readonly ruleFollowedPnl: number;
  readonly ruleBrokenPnl: number;
  readonly mistakeFrequency: readonly { readonly label: string; readonly count: number }[];
  readonly capitalCurve: readonly { readonly date: string; readonly capital: number }[];
};
