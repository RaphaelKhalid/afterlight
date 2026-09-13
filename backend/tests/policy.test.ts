import { describe, expect, it } from "vitest";
import { canReserve, immutableContractMatches, publicationPath, shouldStopBeforeDispatch, telegramCallbackKey } from "../src/policy";

describe("Afterlight spend and deduplication policies", () => {
  it("rejects an unauthorized or over-reserved cap", () => {
    expect(canReserve({ requestedCap: 1, contractMaxCap: 2, availableBudget: 5, heldRemaining: 2, historicalSpent: 2 })).toBe(true);
    expect(canReserve({ requestedCap: 2, contractMaxCap: 2, availableBudget: 5, heldRemaining: 2, historicalSpent: 2 })).toBe(false);
    expect(canReserve({ requestedCap: 3, contractMaxCap: 2, availableBudget: 9, heldRemaining: 0, historicalSpent: 0 })).toBe(false);
  });

  it("requires the exact validated contract hash", () => {
    expect(immutableContractMatches("c1", "hash-a", "c1", "hash-a", "validated")).toBe(true);
    expect(immutableContractMatches("c1", "hash-b", "c1", "hash-a", "validated")).toBe(false);
    expect(immutableContractMatches("c1", "hash-a", "c1", "hash-a", "draft")).toBe(false);
  });

  it("stops dispatch when the remaining cap cannot cover a trial", () => {
    expect(shouldStopBeforeDispatch(1, 0.75, 0.3)).toBe(true);
    expect(shouldStopBeforeDispatch(1, 0.75, 0.25)).toBe(false);
  });

  it("makes Telegram callbacks and GitHub paths stable deduplication keys", () => {
    expect(telegramCallbackKey("start_attempt:q1:n1", "chat", "user")).toBe("callback:start_attempt:q1:n1:chat:user");
    expect(publicationPath("run_123")).toBe("artifacts/runs/run_123.json");
  });
});
