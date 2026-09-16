import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry, transient } from "../lib/brain/retry.ts";

test("transient errors are the ones worth one more try", () => {
  assert.ok(transient(new Error("529 Overloaded"))); assert.ok(transient({ status: 429, message: "rate_limit_error" })); assert.ok(transient(new Error("fetch failed")));
  assert.ok(!transient(new Error("Your credit balance is too low"))); assert.ok(!transient({ status: 401, message: "invalid x-api-key" }));
});

test("withRetry tries once more on a transient failure and gives up on the rest", async () => {
  let calls = 0;
  const ok = await withRetry(async (attempt) => { calls++; if (attempt === 0) throw new Error("overloaded_error"); return `ok on ${attempt}`; }, 2, 1);
  assert.equal(ok, "ok on 1"); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new Error("credit balance too low"); }, 2, 1), /credit/);
  assert.equal(calls, 1, "a hard failure is not retried");
});
