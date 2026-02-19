export type RetryQueueTask = {
  id: string;
  maxAttempts?: number;
  initialDelayMs?: number;
  run: (attempt: number) => Promise<void>;
  onAttemptFailed?: (error: unknown, attempt: number, nextDelayMs: number | null) => void;
  onPermanentFailure?: (error: unknown, attempts: number) => void;
};

type InternalTask = RetryQueueTask & {
  attempts: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

const getBackoffMs = (initialDelayMs: number, attempt: number) => {
  const base = Math.min(MAX_DELAY_MS, initialDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
};

export class RetryQueue {
  private tasks = new Map<string, InternalTask>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Set<string>();

  enqueue(task: RetryQueueTask) {
    const existing = this.tasks.get(task.id);
    if (existing) {
      return;
    }

    this.tasks.set(task.id, {
      ...task,
      attempts: 0,
    });
    this.runNow(task.id);
  }

  runNow(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || this.running.has(taskId)) return;

    const existingTimer = this.timers.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(taskId);
    }

    this.running.add(taskId);
    task.attempts += 1;

    void task.run(task.attempts)
      .then(() => {
        this.running.delete(taskId);
        this.tasks.delete(taskId);
      })
      .catch((error) => {
        this.running.delete(taskId);
        const maxAttempts = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        const initialDelayMs = task.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
        if (task.attempts >= maxAttempts) {
          this.tasks.delete(taskId);
          task.onAttemptFailed?.(error, task.attempts, null);
          task.onPermanentFailure?.(error, task.attempts);
          return;
        }

        const delayMs = getBackoffMs(initialDelayMs, task.attempts);
        task.onAttemptFailed?.(error, task.attempts, delayMs);
        const timer = setTimeout(() => {
          this.timers.delete(taskId);
          this.runNow(taskId);
        }, delayMs);
        this.timers.set(taskId, timer);
      });
  }

  size() {
    return this.tasks.size;
  }
}

