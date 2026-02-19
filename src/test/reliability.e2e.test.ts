import { afterEach, describe, expect, it, vi } from "vitest";
import { getOperationErrorDetails } from "@/lib/errorToasts";
import { RetryQueue } from "@/lib/retryQueue";

describe("Reliability e2e", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries queued work and eventually succeeds", async () => {
    vi.useFakeTimers();
    const queue = new RetryQueue();
    const attempts: number[] = [];

    queue.enqueue({
      id: "message-send",
      run: async (attempt) => {
        attempts.push(attempt);
        if (attempt < 3) {
          throw new Error("Failed to fetch");
        }
      },
    });

    await vi.runAllTimersAsync();
    expect(attempts).toEqual([1, 2, 3]);
    expect(queue.size()).toBe(0);
  });

  it("marks tasks as permanently failed after max attempts", async () => {
    vi.useFakeTimers();
    const queue = new RetryQueue();
    const attempts: number[] = [];
    const permanentFailure = vi.fn();

    queue.enqueue({
      id: "dm-send",
      maxAttempts: 2,
      run: async (attempt) => {
        attempts.push(attempt);
        throw new Error("network down");
      },
      onPermanentFailure: permanentFailure,
    });

    await vi.runAllTimersAsync();
    expect(attempts).toEqual([1, 2]);
    expect(permanentFailure).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(0);
  });

  it("classifies retryable and non-retryable failures for stronger toasts", () => {
    const retryable = getOperationErrorDetails("Send message", { message: "Failed to fetch" });
    expect(retryable.retryable).toBe(true);
    expect(retryable.title).toContain("delayed");

    const nonRetryable = getOperationErrorDetails("Send message", { message: "row-level security policy violation" });
    expect(nonRetryable.retryable).toBe(false);
    expect(nonRetryable.title).toContain("denied");
  });
});

