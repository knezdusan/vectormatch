// D25: In-process step compatibility layer
// src/scheduler/step.ts
//
// Provides the same API as Inngest's `step` object but executes everything
// in-process. This allows existing Inngest function bodies to run unchanged
// under the pg-boss scheduler.
//
// Key differences from Inngest:
// - step.run() calls the function directly (no checkpointing, no SDK overhead)
// - step.sendEvent() enqueues to pg-boss queues (no HTTP, no Docker DNS)
// - step.sleep() uses setTimeout (no durable sleep — use pg-boss delay instead)

import { scheduler } from "./scheduler";

/**
 * Event type matching Inngest's event format.
 */
interface SchedulerEvent {
  id?: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * In-process step compatibility layer. Drop-in replacement for Inngest's
 * `step` object. Each method has the same signature but executes in-process.
 */
export class Step {
  private jobContext: { id: string; data: Record<string, unknown> };

  constructor(jobContext: { id: string; data: Record<string, unknown> }) {
    this.jobContext = jobContext;
  }

  /**
   * Run a step function. In Inngest, this provides checkpointing. In-process,
   * we just call the function directly. If it throws, the job fails and
   * pg-boss will retry it according to its retry policy.
   */
  async run<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    return fn();
  }

  /**
   * Send one or more events to the scheduler queue. Replaces Inngest's
   * step.sendEvent(). Each event becomes a pg-boss job in the queue named
   * after the event name.
   */
  async sendEvent(
    name: string,
    events: SchedulerEvent | SchedulerEvent[],
  ): Promise<void> {
    const arr = Array.isArray(events) ? events : [events];
    for (const event of arr) {
      await scheduler.send(event.name, event.data, event.id);
    }
  }

  /**
   * Sleep for a duration. In-process, this is just setTimeout. For long
   * sleeps, consider using pg-boss's delay feature instead.
   */
  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for an event. Not commonly used in our codebase. In-process,
   * this is a no-op that returns null (we don't have a durable event bus).
   */
  async waitForEvent(_name: string, _timeout: number): Promise<null> {
    console.warn(
      "[Step] waitForEvent is not supported in-process — returning null",
    );
    return null;
  }
}

/**
 * Create a step context for a job. The jobId is used for logging.
 */
export function createStep(
  jobId: string,
  data: Record<string, unknown> = {},
): Step {
  return new Step({ id: jobId, data });
}
