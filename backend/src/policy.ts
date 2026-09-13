export type SpendPolicy = { requestedCap: number; contractMaxCap: number; availableBudget: number; heldRemaining: number; historicalSpent: number };

export function canReserve(policy: SpendPolicy): boolean {
  return Number.isFinite(policy.requestedCap) && policy.requestedCap >= 0 && policy.requestedCap <= policy.contractMaxCap && policy.requestedCap + policy.heldRemaining + policy.historicalSpent <= policy.availableBudget;
}

export function immutableContractMatches(requestedId: string, requestedHash: string, storedId: string, storedHash: string, storedStatus: string): boolean {
  return storedStatus === "validated" && requestedId.length > 0 && requestedHash.length > 0 && requestedId === storedId && requestedHash === storedHash;
}

export function telegramCallbackKey(data: string, chatId: string, userId: string): string {
  return `callback:${data}:${chatId}:${userId}`;
}

export function publicationPath(runId: string): string {
  return `artifacts/runs/${encodeURIComponent(runId)}.json`;
}

export function shouldStopBeforeDispatch(capUsd: number, spentUsd: number, expectedCostUsd: number): boolean {
  return spentUsd + expectedCostUsd > capUsd;
}
