// D25: Scheduler module — in-process job queue using pg-boss
// src/scheduler/index.ts
//
// Public API:
//   - scheduler: the pg-boss singleton (send events, check status)
//   - registerPipelineFunctions: register all critical-path functions
//   - start: start the scheduler (called from instrumentation.ts)
//   - pipeline: the pipeline runner functions (for manual triggering)

export type {
  JobPipelineResult,
  PipelineResult,
} from "./pipeline";
export {
  runBatchPollTier,
  runDirectJobBoardIngestion,
  runGate3Evaluation,
  runJobPipeline,
  runPendingQueueSweep,
} from "./pipeline";
export { registerPipelineFunctions } from "./register";
export { scheduler } from "./scheduler";
