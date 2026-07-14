import { test, describe } from "node:test";
import assert from "node:assert";
import { withExponentialBackoff } from "../exponentialBackoff.js";

describe("withExponentialBackoff", () => {
  test("should resolve immediately if the function succeeds", async () => {
    let calls = 0;
    const result = await withExponentialBackoff(async () => {
      calls++;
      return "success";
    });

    assert.strictEqual(result, "success");
    assert.strictEqual(calls, 1);
  });

  test("should retry on failure and succeed if subsequent attempt succeeds", async () => {
    let calls = 0;
    const result = await withExponentialBackoff(
      async () => {
        calls++;
        if (calls < 3) {
          throw new Error("temporary error");
        }
        return "recovered";
      },
      {
        retries: 3,
        initialMs: 5,
        maxMs: 50,
      },
    );

    assert.strictEqual(result, "recovered");
    assert.strictEqual(calls, 3);
  });

  test("should throw the last error if all retries are exhausted", async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withExponentialBackoff(
          async () => {
            calls++;
            throw new Error(`error attempt ${calls}`);
          },
          {
            retries: 2,
            initialMs: 5,
            maxMs: 50,
          },
        );
      },
      (err: Error) => {
        assert.strictEqual(err.message, "error attempt 3");
        return true;
      },
    );

    assert.strictEqual(calls, 3); // 1 initial try + 2 retries
  });

  test("should respect defaults when partial options are passed", async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withExponentialBackoff(
          async () => {
            calls++;
            throw new Error("fail");
          },
          {
            retries: 1,
            // initialMs defaults to 100, maxMs defaults to 10000
          },
        );
      },
      (err: Error) => {
        assert.strictEqual(err.message, "fail");
        return true;
      },
    );

    assert.strictEqual(calls, 2); // 1 initial + 1 retry
  });

  test("should respect defaults when no options are passed", async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withExponentialBackoff(
          async () => {
            calls++;
            throw new Error("fail");
          },
          // options is omitted
        );
      },
      (err: Error) => {
        assert.strictEqual(err.message, "fail");
        return true;
      },
    );

    assert.strictEqual(calls, 6); // 1 initial + 5 default retries
  });

  test("should throw validation error when options are invalid", async () => {
    await assert.rejects(
      async () => {
        await withExponentialBackoff(
          async () => {
            return "ok";
          },
          {
            initialMs: 500,
            maxMs: 200, // Invalid: maxMs must be greater than initialMs
          },
        );
      },
      (err: Error) => {
        assert.ok(err.message.includes("maxMs must be greater than initialMs"));
        return true;
      },
    );
  });
});
