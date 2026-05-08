export type RTargetRow = {
  readonly rLevel: number;
  readonly movePercentage: number;
  readonly price: number;
};

export function generateRTargetRows(params: {
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly maxR?: number;
}): readonly RTargetRow[] {
  const maxR: number = params.maxR ?? 25;
  const riskPerShare: number = params.entryPrice - params.stopLoss;
  if (params.entryPrice <= 0 || riskPerShare <= 0 || maxR <= 0) {
    return [];
  }
  return Array.from({ length: maxR }, (_value: unknown, index: number) => {
    const rLevel: number = index + 1;
    const price: number = Number((params.entryPrice + (rLevel * riskPerShare)).toFixed(2));
    const movePercentage: number = Number((((price - params.entryPrice) / params.entryPrice) * 100).toFixed(2));
    return { rLevel, movePercentage, price };
  });
}

export function calculateCompletedRLevel(params: {
  readonly currentPrice: number | null;
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly maxR?: number;
}): number | null {
  const maxR: number = params.maxR ?? 25;
  const riskPerShare: number = params.entryPrice - params.stopLoss;
  if (params.currentPrice === null || params.entryPrice <= 0 || riskPerShare <= 0 || maxR <= 0) {
    return null;
  }
  const currentR: number = (params.currentPrice - params.entryPrice) / riskPerShare;
  if (currentR < 1) {
    return null;
  }
  return Math.min(Math.floor(currentR), maxR);
}
