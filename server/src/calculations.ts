import type { ExitRow, TradeRow, TradeStatus } from "./types";

export type TradeSummary = {
  readonly exitedQuantity: number;
  readonly remainingQuantity: number;
  readonly realizedPnl: number;
  readonly averageExitPrice: number;
  readonly finalRMultiple: number;
  readonly status: TradeStatus;
};

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
  return {
    exitedQuantity,
    remainingQuantity,
    realizedPnl,
    averageExitPrice,
    finalRMultiple,
    status: getTradeStatus({ quantity: trade.quantity, remainingQuantity, exitedQuantity })
  };
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
