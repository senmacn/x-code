import test from "node:test";
import assert from "node:assert/strict";
import { parseTweetLink } from "./xClient";

test("parseTweetLink should parse canonical x status url", () => {
  const parsed = parseTweetLink("https://x.com/abc_user/status/1234567890");
  assert.ok(parsed);
  assert.equal(parsed?.tweetId, "1234567890");
  assert.equal(parsed?.username, "abc_user");
});

test("parseTweetLink should parse i/web/status url", () => {
  const parsed = parseTweetLink("https://twitter.com/i/web/status/987654321");
  assert.ok(parsed);
  assert.equal(parsed?.tweetId, "987654321");
  assert.equal(parsed?.username, undefined);
});

test("parseTweetLink should return undefined for non-status url", () => {
  const parsed = parseTweetLink("https://x.com/home");
  assert.equal(parsed, undefined);
});
