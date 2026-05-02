export type TradeStatus = "open" | "partially_exited" | "closed";

export type TradeRow = {
  readonly id: number;
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly stopLoss: number;
  readonly activeStopLoss: number;
  readonly currentPrice: number | null;
  readonly currentPriceUpdatedAt: string | null;
  readonly riskPercentage: number;
  readonly riskCapitalBase: number;
  readonly plannedRiskAmount: number;
  readonly positionValue: number;
  readonly positionSizePercentage: number;
  readonly actualRisk: number;
  readonly riskUsedPercentage: number;
  readonly unrealizedPnl: number;
  readonly unrealizedR: number;
  readonly unrealizedPortfolioImpactPercentage: number;
  readonly setupId: number | null;
  readonly setupName: string | null;
  readonly entryMethodId: number | null;
  readonly entryMethodName: string | null;
  readonly entryReason: string;
  readonly emotionalState: string;
  readonly confidence: number;
  readonly notes: string;
  readonly status: TradeStatus;
  readonly createdAt: string;
};

export type ExitRow = {
  readonly id: number;
  readonly tradeId: number;
  readonly exitDate: string;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly reason: string;
  readonly emotionalState: string;
  readonly notes: string;
  readonly pnl: number;
  readonly rMultiple: number;
  readonly createdAt: string;
};

export type ScreenshotRow = {
  readonly id: number;
  readonly tradeId: number;
  readonly exitId: number | null;
  readonly type: "entry" | "exit";
  readonly filePath: string;
  readonly originalName: string;
  readonly createdAt: string;
};

export type ReviewRow = {
  readonly tradeId: number;
  readonly followedPlan: number;
  readonly ruleScore: number;
  readonly disciplineScore: number;
  readonly wentWell: string;
  readonly wentWrong: string;
  readonly lesson: string;
  readonly repeatNextTime: string;
  readonly avoidNextTime: string;
};
