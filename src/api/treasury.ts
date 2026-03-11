import { EstimateCategory, DisbursementItem, ChangelogEntry, DailyData } from "../types";

// === Estimates ===
export async function syncEstimates(region: string, estimates: EstimateCategory[]): Promise<void> {
  await fetch("/api/sync/estimates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, estimates }),
  });
}

// === Disbursements ===
export async function syncDisbursements(region: string, overrides: Record<string, Partial<DailyData>>): Promise<void> {
  await fetch("/api/sync/disbursements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, overrides }),
  });
}

// === Balances ===
export async function syncBalances(region: string, balances: Record<string, number>): Promise<void> {
  await fetch("/api/sync/balances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, balances }),
  });
}

// === Changelog ===
export async function getChangelog(filters?: {
  region?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: ChangelogEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.region) params.set("region", filters.region);
  if (filters?.entityType) params.set("entityType", filters.entityType);
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));

  const res = await fetch(`/api/changelog?${params}`);
  return res.json();
}

export async function revertChange(changelogId: number): Promise<void> {
  const res = await fetch(`/api/changelog/revert/${changelogId}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to revert change");
  }
}
