/**
 * Shared job-infrastructure types.
 *
 * Centralizes injectable dependency types used by seeders, pollers, and adapters
 * so the same identifier is not duplicated across modules.
 */

/** Injectable fetch function (matches global fetch). */
export type FetchFn = typeof fetch;
