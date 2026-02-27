import test from "node:test";
import assert from "node:assert/strict";
import { planAssetCleanup } from "./mediaCache";

test("planAssetCleanup should evict expired first, then LRU until under max disk", () => {
  const now = new Date("2026-02-27T12:00:00.000Z").getTime();
  const day = 24 * 60 * 60 * 1000;

  const result = planAssetCleanup({
    now,
    ttlDays: 7,
    maxDiskUsageBytes: 500,
    assets: [
      { source_hash: "old", file_size: 100, last_accessed_at: now - 10 * day },
      { source_hash: "hot", file_size: 250, last_accessed_at: now - 1 * day },
      { source_hash: "warm", file_size: 250, last_accessed_at: now - 3 * day },
      { source_hash: "cold", file_size: 250, last_accessed_at: now - 5 * day },
    ],
  });

  assert.deepEqual(result.expiredHashes, ["old"]);
  assert.deepEqual(result.capacityHashes, ["cold"]);
  assert.deepEqual(new Set(result.deleteHashes), new Set(["old", "cold"]));
  assert.equal(result.diskUsageBefore, 850);
  assert.equal(result.diskUsageAfter, 500);
});
