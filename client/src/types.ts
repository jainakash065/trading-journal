export type ReferenceItem = {
  readonly id: number;
  readonly name?: string;
  readonly label?: string;
  readonly active: number;
};

export type Settings = {
  readonly startingCapital: string;
  readonly capitalHistoryStartDate: string;
  readonly defaultMarket: string;
  readonly defaultDirection: string;
  readonly defaultRiskPercentage: string;
  readonly currentCapital: number;
  readonly currentYearHolidayCount: number;
  readonly missingHolidayYear: number | null;
};

export type MarketHoliday = {
  readonly id: number;
  readonly date: string;
  readonly name: string;
  readonly market: string;
  readonly createdAt: string;
};

export type TradeSummary = {
  readonly exitedQuantity: number;
  readonly remainingQuantity: number;
  readonly realizedPnl: number;
  readonly portfolioImpactPercentage: number;
  readonly unrealizedPnl: number;
  readonly unrealizedR: number;
  readonly unrealizedPortfolioImpactPercentage: number;
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
  readonly status: string;
  readonly summary: TradeSummary;
};

export type PagedTrades = {
  readonly items: readonly Trade[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
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
export type LastNTradeCount = 10 | 20 | 50;

export type DashboardPeriod = {
  readonly key: DashboardPeriodKey;
  readonly label: string;
  readonly startDate: string | null;
  readonly endDate: string;
};

export type RDistributionBucket = {
  readonly label: string;
  readonly count: number;
};

export type CapitalCurvePoint = {
  readonly date: string;
  readonly capital: number;
  readonly dailyPnl: number;
};

export type StreakMood = "normal" | "caution" | "defensive" | "review";

export type StreakAnalytics = {
  readonly currentLosingStreak: number;
  readonly maxLosingStreak: number;
  readonly worstStreakR: number;
  readonly worstStreakPnl: number;
  readonly streakMood: StreakMood;
};

export type LastNTradesAnalytics = {
  readonly selectedN: LastNTradeCount;
  readonly actualCount: number;
  readonly pnl: number;
  readonly winRate: number;
  readonly averageR: number;
  readonly rExpectancy: number;
  readonly profitFactor: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly expectancyWithoutLargestWinner: number;
  readonly averageWinningHoldDays: number;
  readonly averageLosingHoldDays: number;
  readonly rDistribution: readonly RDistributionBucket[];
  readonly streakAnalytics: StreakAnalytics;
};

export type SetupAnalyticsRow = {
  readonly setupName: string;
  readonly closedTrades: number;
  readonly winRate: number;
  readonly rExpectancy: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly medianR: number;
  readonly pnl: number;
};

export type EntryMethodAnalyticsRow = {
  readonly entryMethodName: string;
  readonly closedTrades: number;
  readonly winRate: number;
  readonly rExpectancy: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly medianR: number;
  readonly pnl: number;
};

export type SetupEntryMethodAnalyticsRow = {
  readonly setupName: string;
  readonly entryMethodName: string;
  readonly closedTrades: number;
  readonly winRate: number;
  readonly rExpectancy: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly medianR: number;
  readonly pnl: number;
};

export type RuleAdherenceAnalyticsRow = {
  readonly category: string;
  readonly closedTrades: number;
  readonly winRate: number;
  readonly rExpectancy: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly medianR: number;
  readonly pnl: number;
};

export type Dashboard = {
  readonly period: DashboardPeriod;
  readonly capitalHistoryStartDate: string;
  readonly startingCapital: number;
  readonly currentCapital: number;
  readonly totalRealizedPnl: number;
  readonly periodCapitalAvailable: boolean;
  readonly periodStartingCapital: number | null;
  readonly periodEndingCapital: number | null;
  readonly periodCapitalChange: number | null;
  readonly periodCapitalChangePercentage: number | null;
  readonly periodPnl: number;
  readonly periodBookedPnl: number;
  readonly periodClosedTradePnl: number;
  readonly periodOpenRealizedPnl: number;
  readonly periodClosedTrades: number;
  readonly winRate: number;
  readonly winPercentage: number;
  readonly lossPercentage: number;
  readonly averageWinner: number;
  readonly averageLoser: number;
  readonly profitFactor: number;
  readonly averageR: number;
  readonly averageWinningR: number;
  readonly averageLosingR: number;
  readonly averageWinningHoldDays: number;
  readonly averageLosingHoldDays: number;
  readonly rExpectancy: number;
  readonly medianR: number;
  readonly largestWinnerR: number;
  readonly expectancyWithoutLargestWinner: number;
  readonly rDistribution: readonly RDistributionBucket[];
  readonly streakAnalytics: StreakAnalytics;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly openTrades: number;
  readonly openRiskExposure: number;
  readonly openRiskPercentage: number;
  readonly openInvestedValue: number;
  readonly openInvestedPercentage: number;
  readonly bestSetup: string;
  readonly worstSetup: string;
  readonly ruleFollowedPnl: number;
  readonly ruleBrokenPnl: number;
  readonly mistakeFrequency: readonly { readonly label: string; readonly count: number }[];
  readonly capitalCurve: readonly CapitalCurvePoint[];
  readonly lastNTrades: LastNTradesAnalytics;
  readonly setupAnalytics: readonly SetupAnalyticsRow[];
  readonly entryMethodAnalytics: readonly EntryMethodAnalyticsRow[];
  readonly setupEntryMethodAnalytics: readonly SetupEntryMethodAnalyticsRow[];
  readonly ruleAdherenceAnalytics: readonly RuleAdherenceAnalyticsRow[];
  readonly missingHolidayYear: number | null;
};
