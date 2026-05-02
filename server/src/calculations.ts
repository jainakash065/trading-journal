import type { ExitRow, TradeRow, TradeStatus } from "./types";

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
  readonly status: TradeStatus;
};

const millisecondsPerDay: number = 24 * 60 * 60 * 1000;

export function calculateRiskPerShare(entryPrice: number, stopLoss: number): number {
  return Math.max(entryPrice - stopLoss, 0);
}

export function calculateActualTradeRisk(params: {
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly quantity: number;
}): number {
  const riskPerShare: number = calculateRiskPerShare(params.entryPrice, params.stopLoss);
  return Number((riskPerShare * params.quantity).toFixed(2));
}

export function calculatePlannedRiskAmount(params: {
  readonly riskCapitalBase: number;
  readonly riskPercentage: number;
}): number {
  return Number((params.riskCapitalBase * (params.riskPercentage / 100)).toFixed(2));
}

export function calculateRiskUsedPercentage(params: {
  readonly actualRisk: number;
  readonly plannedRiskAmount: number;
}): number {
  if (params.plannedRiskAmount <= 0) {
    return 0;
  }
  return Number(((params.actualRisk / params.plannedRiskAmount) * 100).toFixed(2));
}

export function calculatePositionValue(entryPrice: number, quantity: number): number {
  return Number((entryPrice * quantity).toFixed(2));
}

export function calculatePositionSizePercentage(params: {
  readonly positionValue: number;
  readonly riskCapitalBase: number;
}): number {
  if (params.riskCapitalBase <= 0) {
    return 0;
  }
  return Number(((params.positionValue / params.riskCapitalBase) * 100).toFixed(2));
}

export function calculateStopLossPriceFromPercentage(params: {
  readonly entryPrice: number;
  readonly stopLossPercentage: number;
}): number | null {
  if (params.entryPrice <= 0 || !Number.isFinite(params.entryPrice) || !Number.isFinite(params.stopLossPercentage)) {
    return null;
  }
  return Number((params.entryPrice * (1 - params.stopLossPercentage / 100)).toFixed(2));
}

export function calculateStopLossPercentageFromPrice(params: {
  readonly entryPrice: number;
  readonly stopLoss: number;
}): number | null {
  if (params.entryPrice <= 0 || !Number.isFinite(params.entryPrice) || !Number.isFinite(params.stopLoss)) {
    return null;
  }
  return Number((((params.entryPrice - params.stopLoss) / params.entryPrice) * 100).toFixed(2));
}

export function calculatePortfolioImpactPercentage(params: {
  readonly realizedPnl: number;
  readonly riskCapitalBase: number;
}): number {
  if (params.riskCapitalBase <= 0) {
    return 0;
  }
  return Number(((params.realizedPnl / params.riskCapitalBase) * 100).toFixed(2));
}

export function calculateUnrealizedPnl(params: {
  readonly currentPrice: number | null;
  readonly entryPrice: number;
  readonly remainingQuantity: number;
  readonly status: TradeStatus;
}): number {
  if (params.currentPrice === null || params.status === "closed") {
    return 0;
  }
  return Number(((params.currentPrice - params.entryPrice) * params.remainingQuantity).toFixed(2));
}

export function calculateInclusiveDurationDays(params: {
  readonly entryDate: string;
  readonly exitDate: string;
}): number {
  const entryTime: number = Date.parse(`${params.entryDate}T00:00:00Z`);
  const exitTime: number = Date.parse(`${params.exitDate}T00:00:00Z`);
  if (!Number.isFinite(entryTime) || !Number.isFinite(exitTime) || exitTime < entryTime) {
    return 0;
  }
  return Math.floor((exitTime - entryTime) / millisecondsPerDay) + 1;
}

export function calculateSuggestedQuantity(params: {
  readonly capital: number;
  readonly riskPercentage: number;
  readonly entryPrice: number;
  readonly stopLoss: number;
}): number {
  const riskPerShare: number = calculateRiskPerShare(params.entryPrice, params.stopLoss);
  if (riskPerShare <= 0) {
    return 0;
  }
  return Math.floor((params.capital * (params.riskPercentage / 100)) / riskPerShare);
}

export function calculateExitPnl(entryPrice: number, exitPrice: number, quantity: number): number {
  return Number(((exitPrice - entryPrice) * quantity).toFixed(2));
}

export function calculateExitRMultiple(params: {
  readonly pnl: number;
  readonly tradeQuantity: number;
  readonly entryPrice: number;
  readonly stopLoss: number;
}): number {
  const tradeRisk: number = calculateActualTradeRisk({
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    quantity: params.tradeQuantity
  });
  if (tradeRisk <= 0) {
    return 0;
  }
  return Number((params.pnl / tradeRisk).toFixed(2));
}

export function calculateTradeRMultiple(params: {
  readonly realizedPnl: number;
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly quantity: number;
}): number {
  const actualTradeRisk: number = calculateActualTradeRisk({
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    quantity: params.quantity
  });
  if (actualTradeRisk <= 0) {
    return 0;
  }
  return Number((params.realizedPnl / actualTradeRisk).toFixed(2));
}

export function summarizeTrade(trade: TradeRow, exits: readonly ExitRow[]): TradeSummary {
  const exitedQuantity: number = exits.reduce((total: number, exit: ExitRow) => total + exit.quantity, 0);
  const realizedPnl: number = Number(exits.reduce((total: number, exit: ExitRow) => total + exit.pnl, 0).toFixed(2));
  const remainingQuantity: number = Math.max(trade.quantity - exitedQuantity, 0);
  const averageExitPrice: number = exitedQuantity > 0
    ? Number((exits.reduce((total: number, exit: ExitRow) => total + exit.exitPrice * exit.quantity, 0) / exitedQuantity).toFixed(2))
    : 0;
  const finalRMultiple: number = calculateTradeRMultiple({
    realizedPnl,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    quantity: trade.quantity
  });
  const status: TradeStatus = getTradeStatus({ quantity: trade.quantity, remainingQuantity, exitedQuantity });
  const unrealizedPnl: number = calculateUnrealizedPnl({
    currentPrice: trade.currentPrice,
    entryPrice: trade.entryPrice,
    remainingQuantity,
    status
  });
  return {
    exitedQuantity,
    remainingQuantity,
    realizedPnl,
    portfolioImpactPercentage: calculatePortfolioImpactPercentage({
      realizedPnl,
      riskCapitalBase: trade.riskCapitalBase
    }),
    unrealizedPnl,
    unrealizedR: calculateTradeRMultiple({
      realizedPnl: unrealizedPnl,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      quantity: trade.quantity
    }),
    unrealizedPortfolioImpactPercentage: calculatePortfolioImpactPercentage({
      realizedPnl: unrealizedPnl,
      riskCapitalBase: trade.riskCapitalBase
    }),
    averageExitPrice,
    finalRMultiple,
    durationDays: status === "closed" ? calculateClosedDurationDays(trade, exits) : 0,
    status
  };
}

function calculateClosedDurationDays(trade: TradeRow, exits: readonly ExitRow[]): number {
  const lastExit: ExitRow | undefined = exits.at(-1);
  if (!lastExit) {
    return 0;
  }
  return calculateInclusiveDurationDays({ entryDate: trade.entryDate, exitDate: lastExit.exitDate });
}

function getTradeStatus(params: {
  readonly quantity: number;
  readonly remainingQuantity: number;
  readonly exitedQuantity: number;
}): TradeStatus {
  if (params.exitedQuantity <= 0) {
    return "open";
  }
  if (params.remainingQuantity <= 0 || params.exitedQuantity >= params.quantity) {
    return "closed";
  }
  return "partially_exited";
}
