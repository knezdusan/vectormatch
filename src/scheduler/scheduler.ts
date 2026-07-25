// D25: In-process scheduler using pg-boss
// src/scheduler/scheduler.ts
//
// Replaces Inngest as the orchestration layer. Uses pg-boss (Postgres-backed
// job queue) for both cron-scheduled jobs and event-driven fan-out.
//
// Key properties:
// - Runs inside the app container (no external server, no Docker DNS)
// - Queue state lives in Postgres (survives container restarts)
// - No HTTP hops, no cached step URIs, no network aliases
// - Starts automatically on server startup via instrumentation.ts
//
// Queue naming convention:
// - Cron jobs: "cron:<functionId>" (e.g., "cron:batch-poll-tier")
// - Event jobs: "event:<eventName>" (e.g., "event:job/ingested")
//
// The scheduler is a singleton — one instance per process.

import { type Job, PgBoss } from "pg-boss";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CronRegistration {
  /** Function ID (matches the old Inngest function ID) */
  id: string;
  /** Human-readable name for logging */
  name: string;
  /** Cron expression (standard 5-field: min hour day month weekday) */
  cron: string;
  /** Handler function */
  handler: () => Promise<void>;
  /** Concurrency limit (default: 1 for cron jobs) */
  concurrency?: number;
  /** Max retry attempts (default: 3) */
  retries?: number;
}

export interface EventRegistration {
  /** Event name (e.g., "job/ingested") */
  event: string;
  /** Human-readable name for logging */
  name: string;
  /** Handler function — receives the event data */
  handler: (data: Record<string, unknown>, step: StepLike) => Promise<void>;
  /** Concurrency limit (default: 10) */
  concurrency?: number;
  /** Max retry attempts (default: 5) */
  retries?: number;
}

// Minimal step interface for type compatibility
interface StepLike {
  run<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  sendEvent(
    name: string,
    events:
      | { id?: string; name: string; data: Record<string, unknown> }
      | Array<{ id?: string; name: string; data: Record<string, unknown> }>,
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
}

// ── Scheduler Singleton ──────────────────────────────────────────────────────

class Scheduler {
  private boss: PgBoss | null = null;
  private started = false;
  private starting = false;
  private registrations: {
    crons: CronRegistration[];
    events: EventRegistration[];
  } = { crons: [], events: [] };

  /**
   * Register a cron job. Must be called before start().
   */
  registerCron(reg: CronRegistration): void {
    this.registrations.crons.push(reg);
  }

  /**
   * Register an event handler. Must be called before start().
   */
  registerEvent(reg: EventRegistration): void {
    this.registrations.events.push(reg);
  }

  /**
   * Send an event to the queue. This replaces inngest.send().
   * Can be called from anywhere in the app (e.g., from a Server Action,
   * from another scheduled job, etc.).
   */
  async send(
    eventName: string,
    data: Record<string, unknown>,
    id?: string,
  ): Promise<void> {
    if (!this.boss || !this.started) {
      console.warn(
        `[scheduler] Cannot send event "${eventName}" — scheduler not started. Queuing for later.`,
      );
      return;
    }

    const queueName = this.eventQueueName(eventName);
    await this.boss.send(queueName, data, {
      // Use the provided ID for deduplication (same as Inngest's event ID)
      ...(id ? { id } : {}),
      // Retry configuration
      retryLimit: 5,
      retryDelay: 30, // 30 seconds between retries
      // Expiration: if a job sits in the queue for >1 hour, expire it
      expireInSeconds: 3600,
    });
  }

  /**
   * Send multiple events in a batch. More efficient than calling send()
   * in a loop.
   */
  async sendBatch(
    events: Array<{ name: string; data: Record<string, unknown>; id?: string }>,
  ): Promise<void> {
    if (!this.boss || !this.started) {
      console.warn("[scheduler] Cannot send batch — scheduler not started.");
      return;
    }

    // Group by queue name for efficient batching
    const byQueue = new Map<
      string,
      Array<{ data: Record<string, unknown>; id?: string }>
    >();
    for (const event of events) {
      const queueName = this.eventQueueName(event.name);
      if (!byQueue.has(queueName)) {
        byQueue.set(queueName, []);
      }
      byQueue.get(queueName)!.push({ data: event.data, id: event.id });
    }

    for (const [queueName, jobs] of byQueue) {
      const inserts = jobs.map((j) => ({
        ...(j.id ? { id: j.id } : {}),
        data: j.data,
        retryLimit: 5,
        retryDelay: 30,
        expireInSeconds: 3600,
      }));
      await this.boss.insert(queueName, inserts);
    }
  }

  /**
   * Start the scheduler. Creates the pg-boss instance, starts it,
   * registers all cron schedules and event handlers.
   *
   * Called from instrumentation.ts on server startup.
   */
  async start(): Promise<void> {
    if (this.started || this.starting) return;
    this.starting = true;

    try {
      // Get the DATABASE_URL from the db module (same connection string
      // the app uses). pg-boss needs a direct connection string.
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("DATABASE_URL is not set — scheduler cannot start");
      }

      // Create pg-boss instance. It will create its own schema
      // (pgboss) in the existing database.
      this.boss = new PgBoss({
        connectionString,
        // Schema name — defaults to "pgboss"
        schema: "pgboss",
        // Maintenance interval: how often pg-boss cleans up
        maintenanceIntervalSeconds: 120,
      });

      // Handle pg-boss errors
      this.boss.on("error", (error: Error) => {
        console.error("[scheduler] pg-boss error:", error);
      });

      // Start pg-boss (creates schema if needed)
      await this.boss.start();
      console.info("[scheduler] pg-boss started successfully");

      // Register all cron schedules
      for (const reg of this.registrations.crons) {
        await this.registerCronJob(reg);
      }

      // Register all event handlers
      for (const reg of this.registrations.events) {
        await this.registerEventHandler(reg);
      }

      this.started = true;
      console.info(
        `[scheduler] Started: ${this.registrations.crons.length} cron jobs, ` +
          `${this.registrations.events.length} event handlers`,
      );
    } catch (error) {
      console.error(
        "[scheduler] Failed to start:",
        error instanceof Error ? error.message : error,
      );
      // Don't throw — the app should still start even if the scheduler fails.
      // The scheduler will retry on the next server restart.
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stop the scheduler gracefully. Called on server shutdown.
   */
  async stop(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
    this.started = false;
    console.info("[scheduler] pg-boss stopped");
  }

  /**
   * Check if the scheduler is running.
   */
  isRunning(): boolean {
    return this.started;
  }

  // ── Internal methods ──────────────────────────────────────────────────────

  private eventQueueName(eventName: string): string {
    // pg-boss queue names can contain slashes and hyphens
    return `event:${eventName}`;
  }

  private cronQueueName(functionId: string): string {
    return `cron:${functionId}`;
  }

  private async registerCronJob(reg: CronRegistration): Promise<void> {
    const queueName = this.cronQueueName(reg.id);

    // Register the handler
    await this.boss!.work(
      queueName,
      { teamSize: 1, batchSize: 1 },
      async (jobs: Job[]) => {
        for (const job of jobs) {
          try {
            await reg.handler();
          } catch (error) {
            console.error(
              `[scheduler] Cron job "${reg.name}" (${reg.id}) failed:`,
              error instanceof Error ? error.message : error,
            );
            throw error; // pg-boss will retry
          }
        }
      },
    );

    // Schedule the cron job
    // pg-boss cron uses a special queue name and schedule
    await this.boss!.schedule(
      queueName,
      reg.cron,
      {}, // no data — the handler doesn't need it
    );

    console.info(`[scheduler] Registered cron: ${reg.name} (${reg.cron})`);
  }

  private async registerEventHandler(reg: EventRegistration): Promise<void> {
    const queueName = this.eventQueueName(reg.event);

    const concurrency = reg.concurrency ?? 10;
    const retryLimit = reg.retries ?? 5;

    // Register the handler with concurrency control
    await this.boss!.work(
      queueName,
      {
        teamSize: concurrency,
        batchSize: 1,
        newOptions: {
          retryLimit,
          retryDelay: 30,
        },
      },
      async (jobs: Job[]) => {
        for (const job of jobs) {
          try {
            // Create a step context for this job
            const step = createStepForJob(
              job.id,
              job.data as Record<string, unknown>,
            );
            await reg.handler(job.data as Record<string, unknown>, step);
          } catch (error) {
            console.error(
              `[scheduler] Event handler "${reg.name}" (${reg.event}) failed for job ${job.id}:`,
              error instanceof Error ? error.message : error,
            );
            throw error; // pg-boss will retry
          }
        }
      },
    );

    console.info(
      `[scheduler] Registered event handler: ${reg.name} (${reg.event}, concurrency=${concurrency})`,
    );
  }
}

// ── Step factory ─────────────────────────────────────────────────────────────

function createStepForJob(
  jobId: string,
  data: Record<string, unknown>,
): StepLike {
  // Import here to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Step } = require("./step");
  return new Step({ id: jobId, data });
}

// ── Export singleton ─────────────────────────────────────────────────────────

export const scheduler = new Scheduler();
