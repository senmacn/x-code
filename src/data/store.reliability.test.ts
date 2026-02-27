import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { Store } from "./store";

const createTempStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x-code-store-"));
  const dbPath = path.join(dir, "test.db");
  const store = new Store(dbPath);
  return {
    store,
    cleanup: () => {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};

test("saveTweets should upsert existing tweet and preserve old media_json when new value is undefined", () => {
  const { store, cleanup } = createTempStore();
  try {
    store.upsertUser({ id: "u1", username: "alice", name: "Alice" });

    store.saveTweets([
      {
        id: "t1",
        user_id: "u1",
        text: "old",
        created_at: "2026-02-01T00:00:00.000Z",
        lang: "en",
        media_json: JSON.stringify([{ id: 1 }]),
        entities_json: undefined,
        raw_json: undefined,
      },
    ]);
    store.saveTweets([
      {
        id: "t1",
        user_id: "u1",
        text: "new",
        created_at: "2026-02-02T00:00:00.000Z",
        lang: "en",
        media_json: undefined,
        entities_json: undefined,
        raw_json: undefined,
      },
    ]);

    const row = store.listTweetsByUser("alice", 1)[0];
    assert.equal(row.text, "new");
    assert.equal(row.created_at, "2026-02-02T00:00:00.000Z");
    assert.equal(row.media_json, JSON.stringify([{ id: 1 }]));
  } finally {
    cleanup();
  }
});

test("user rate limit should persist and expire", () => {
  const { store, cleanup } = createTempStore();
  try {
    const now = Date.now();
    store.setUserRateLimit("alice", now + 5_000, "429");
    const blocked = store.getUserRateLimit("alice", now + 1_000);
    assert.equal(blocked, now + 5_000);

    const expired = store.getUserRateLimit("alice", now + 6_000);
    assert.equal(expired, undefined);
  } finally {
    cleanup();
  }
});

test("task run should honor retry window and support resume acquire", () => {
  const { store, cleanup } = createTempStore();
  try {
    const now = Date.now();
    const first = store.acquireTaskRun("media-backfill", { now, payload_json: "{}" });
    assert.equal(first.acquired, true);
    assert.equal(first.task.attempt, 1);

    store.touchTaskRun("media-backfill", JSON.stringify({ offset: 100 }), now + 1_000);
    store.failTaskRun("media-backfill", {
      error: "failed",
      nextRetryAt: now + 10_000,
      progressJson: JSON.stringify({ offset: 100 }),
    });

    const blocked = store.acquireTaskRun("media-backfill", { now: now + 2_000 });
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.reason, "retry_wait");

    const resumed = store.acquireTaskRun("media-backfill", {
      now: now + 2_000,
      ignoreRetryWindow: true,
    });
    assert.equal(resumed.acquired, true);
    assert.equal(resumed.task.attempt, 2);
    assert.equal(resumed.task.progress_json, JSON.stringify({ offset: 100 }));
  } finally {
    cleanup();
  }
});
