/**
 * Measure Neon steady-state size after rolling-window expiry runs a full cycle.
 *
 * User priority #2: "Neon steady-state size after rolling-window expiry runs
 * a full cycle (headroom under 512MB wall)"
 *
 * The rolling-window changes:
 * 1. Retention changed from 90 → 30 days (deleteAncientJobs)
 * 2. Embedding skipped for fenced jobs (country_fenced, region_fenced, onsite)
 * 3. Embedding nulled post-hoc if deterministic multi-probe fences a job
 * 4. raw_json already nulled after normalization (G7)
 *
 * This script measures:
 * 1. Current Neon database size (total)
 * 2. Current job table size (rows, bytes)
 * 3. Current embedding storage (bytes in job_embedding column)
 * 4. Current raw_json storage (should be mostly NULL after G7)
 * 5. Projected steady-state after 30-day rolling window:
 *    - How many jobs are older than 30 days (would be deleted)
 *    - How many jobs are fenced (embedding would be nulled)
 *    - Projected total size after cleanup
 * 6. Headroom under 512MB wall
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== Neon Steady-State Size Measurement ===\n");

  // 1. Current database size
  const dbSize = await sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size,
           pg_database_size(current_database()) as bytes
  `;
  console.log(
    "Current database size:",
    dbSize[0].size,
    `(${dbSize[0].bytes} bytes)`,
  );

  // 2. Total table sizes (top 10)
  const tableSizes = await sql`
    SELECT
      schemaname || '.' || relname as table,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_total_relation_size(relid) as total_bytes,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 15
  `;
  console.log("\n--- Top 15 tables by size ---");
  console.table(
    tableSizes.map((t) => ({
      table: t.table,
      size: t.total_size,
      rows: t.row_count,
      mb: (t.total_bytes / 1024 / 1024).toFixed(2),
    })),
  );

  // 3. Job table breakdown
  const jobStats = await sql`
    SELECT
      count(*) as total_jobs,
      count(*) FILTER (WHERE status = 'active') as active_jobs,
      count(*) FILTER (WHERE status = 'rejected') as rejected_jobs,
      count(*) FILTER (WHERE status = 'gone') as gone_jobs,
      count(*) FILTER (WHERE status = 'stale') as stale_jobs,
      count(*) FILTER (WHERE normalized_at IS NOT NULL) as normalized_jobs,
      count(*) FILTER (WHERE job_embedding IS NOT NULL) as jobs_with_embedding,
      count(*) FILTER (WHERE raw_json IS NOT NULL) as jobs_with_raw_json,
      count(*) FILTER (WHERE remote_scope = 'global') as global_jobs,
      count(*) FILTER (WHERE remote_scope = 'country_fenced') as country_fenced,
      count(*) FILTER (WHERE remote_scope = 'region_fenced') as region_fenced,
      count(*) FILTER (WHERE remote_scope = 'onsite') as onsite_jobs,
      count(*) FILTER (WHERE remote_scope = 'unknown') as unknown_jobs,
      count(*) FILTER (WHERE remote_scope = 'undetermined') as undetermined_jobs
    FROM job
  `;
  console.log("\n--- Job table stats ---");
  console.table(jobStats[0]);

  // 4. Job age distribution
  const ageDist = await sql`
    SELECT
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) >= NOW() - INTERVAL '7 days') as last_7d,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) >= NOW() - INTERVAL '14 days' AND COALESCE(published_at, detected_at) < NOW() - INTERVAL '7 days') as days_7_14,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) >= NOW() - INTERVAL '30 days' AND COALESCE(published_at, detected_at) < NOW() - INTERVAL '14 days') as days_14_30,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) >= NOW() - INTERVAL '60 days' AND COALESCE(published_at, detected_at) < NOW() - INTERVAL '30 days') as days_30_60,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) < NOW() - INTERVAL '60 days') as older_60d,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) < NOW() - INTERVAL '30 days') as older_30d,
      count(*) FILTER (WHERE COALESCE(published_at, detected_at) < NOW() - INTERVAL '90 days') as older_90d
    FROM job
    WHERE status = 'active'
  `;
  console.log("\n--- Active job age distribution ---");
  console.table(ageDist[0]);

  // 5. Embedding storage estimate
  // text-embedding-3-small: 1536 dimensions × 4 bytes (float32) = 6144 bytes per embedding
  // Plus TOAST overhead ~100 bytes
  const embeddingBytes = await sql`
    SELECT
      count(*) as count,
      pg_size_pretty(sum(pg_column_size(job_embedding))) as embedding_size,
      sum(pg_column_size(job_embedding)) as embedding_bytes
    FROM job
    WHERE job_embedding IS NOT NULL
  `;
  console.log("\n--- Embedding storage ---");
  console.log("Jobs with embedding:", embeddingBytes[0].count);
  console.log("Embedding storage:", embeddingBytes[0].embedding_size);
  console.log(
    "Avg per embedding:",
    `${Math.round(embeddingBytes[0].embedding_bytes / Math.max(embeddingBytes[0].count, 1))} bytes`,
  );

  // 6. raw_json storage (should be mostly NULL after G7)
  const rawJsonBytes = await sql`
    SELECT
      count(*) as count,
      pg_size_pretty(sum(pg_column_size(raw_json))) as raw_json_size,
      sum(pg_column_size(raw_json)) as raw_json_bytes
    FROM job
    WHERE raw_json IS NOT NULL
  `;
  console.log("\n--- raw_json storage (should be mostly NULL after G7) ---");
  console.log("Jobs with raw_json:", rawJsonBytes[0].count);
  console.log("raw_json storage:", rawJsonBytes[0].raw_json_size);

  // 7. Projected steady-state after 30-day rolling window
  const projection = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'active' AND COALESCE(published_at, detected_at) >= NOW() - INTERVAL '30 days') as jobs_kept,
      count(*) FILTER (WHERE status = 'active' AND COALESCE(published_at, detected_at) < NOW() - INTERVAL '30 days') as jobs_expired,
      count(*) FILTER (WHERE status = 'active' AND COALESCE(published_at, detected_at) >= NOW() - INTERVAL '30 days' AND job_embedding IS NOT NULL) as embeddings_kept,
      count(*) FILTER (WHERE status = 'active' AND COALESCE(published_at, detected_at) >= NOW() - INTERVAL '30 days' AND remote_scope IN ('country_fenced', 'region_fenced', 'onsite')) as fenced_in_window,
      count(*) FILTER (WHERE status = 'active' AND COALESCE(published_at, detected_at) >= NOW() - INTERVAL '30 days' AND remote_scope IN ('country_fenced', 'region_fenced', 'onsite') AND job_embedding IS NOT NULL) as fenced_with_embedding
    FROM job
  `;
  console.log("\n=== Projected steady-state (30-day rolling window) ===\n");
  console.table(projection[0]);

  // 8. Calculate projected size
  const totalBytes = dbSize[0].bytes;
  const embeddingBytesTotal = embeddingBytes[0].embedding_bytes || 0;
  const rawJsonBytesTotal = rawJsonBytes[0].raw_json_bytes || 0;

  // Jobs that would be deleted by 30-day window
  const jobsExpired = projection[0].jobs_expired || 0;
  const totalActiveJobs = (projection[0].jobs_kept || 0) + jobsExpired;
  const expireRatio = totalActiveJobs > 0 ? jobsExpired / totalActiveJobs : 0;

  // Embeddings that would be nulled (fenced jobs in window + expired jobs)
  const fencedWithEmbedding = projection[0].fenced_with_embedding || 0;
  const embeddingsNulled = fencedWithEmbedding; // Fenced jobs in window get embedding nulled

  // Estimate: each embedding is ~6244 bytes (6144 + overhead)
  const avgEmbeddingSize =
    embeddingBytes[0].count > 0
      ? embeddingBytes[0].embedding_bytes / embeddingBytes[0].count
      : 6244;

  // Projected savings
  const expiredJobSavings = jobsExpired * avgEmbeddingSize; // expired jobs' embeddings deleted
  const fencedEmbeddingSavings = embeddingsNulled * avgEmbeddingSize; // fenced jobs' embeddings nulled
  const totalSavings = expiredJobSavings + fencedEmbeddingSavings;

  const projectedSize = totalBytes - totalSavings;
  const projectedMB = projectedSize / 1024 / 1024;
  const headroomMB = 512 - projectedMB;

  console.log("\n=== Size Projection ===\n");
  console.log(
    "Current total DB size:",
    `${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log("Jobs that would expire (>30d):", jobsExpired);
  console.log("Fenced jobs in window (embedding → null):", fencedWithEmbedding);
  console.log(
    "Embedding savings from expiry:",
    `${(expiredJobSavings / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(
    "Embedding savings from fencing:",
    `${(fencedEmbeddingSavings / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(
    "Total projected savings:",
    `${(totalSavings / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log("Projected steady-state size:", `${projectedMB.toFixed(2)} MB`);
  console.log("Headroom under 512MB wall:", `${headroomMB.toFixed(2)} MB`);
  console.log("Headroom %:", `${((headroomMB / 512) * 100).toFixed(1)}%`);

  // 9. Job table specific size
  const jobTableSize = await sql`
    SELECT
      pg_size_pretty(pg_total_relation_size('job')) as total_size,
      pg_total_relation_size('job') as total_bytes,
      pg_size_pretty(pg_relation_size('job')) as table_size,
      pg_relation_size('job') as table_bytes
  `;
  console.log("\n--- Job table size ---");
  console.log("Total (table + indexes):", jobTableSize[0].total_size);
  console.log("Table only:", jobTableSize[0].table_size);

  // 10. Index sizes for job table
  const indexSizes = await sql`
    SELECT
      indexrelname as index_name,
      pg_size_pretty(pg_relation_size(indexrelid)) as size,
      pg_relation_size(indexrelid) as bytes
    FROM pg_stat_user_indexes
    WHERE relname = 'job'
    ORDER BY pg_relation_size(indexrelid) DESC
  `;
  console.log("\n--- Job table indexes ---");
  console.table(
    indexSizes.map((i: any) => ({
      index: i.index_name,
      size: i.size,
      mb: (i.bytes / 1024 / 1024).toFixed(2),
    })),
  );

  // 11. Projected HNSW index savings
  const hnswIndex = indexSizes.find(
    (i: any) =>
      i.index_name?.includes("embedding") ||
      i.index_name?.includes("hnsw") ||
      i.index_name?.includes("vector"),
  );
  if (hnswIndex) {
    const hnswBytes = Number(hnswIndex.bytes);
    const totalEmbeddings = Number(embeddingBytes[0].count);
    const embeddingsToRemove =
      Number(projection[0].jobs_expired || 0) +
      Number(projection[0].fenced_with_embedding || 0);
    const projectedHnswBytes =
      totalEmbeddings > 0
        ? (hnswBytes * (totalEmbeddings - embeddingsToRemove)) / totalEmbeddings
        : 0;
    const hnswSavings = hnswBytes - projectedHnswBytes;
    console.log("\n--- HNSW vector index projection ---");
    console.log(
      "Current HNSW index size:",
      `${(hnswBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log("Embeddings to remove (expired + fenced):", embeddingsToRemove);
    console.log(
      "Projected HNSW index size:",
      `${(projectedHnswBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      "HNSW index savings:",
      `${(hnswSavings / 1024 / 1024).toFixed(2)} MB`,
    );

    const totalProjectedWithHnsw = projectedSize - hnswSavings;
    const totalHeadroomWithHnsw = 512 - totalProjectedWithHnsw / 1024 / 1024;
    console.log(
      "\n=== REVISED projection (including HNSW index shrinkage) ===",
    );
    console.log(
      "Projected steady-state size:",
      `${(totalProjectedWithHnsw / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      "Headroom under 512MB wall:",
      `${totalHeadroomWithHnsw.toFixed(2)} MB`,
    );
    console.log(
      "Headroom %:",
      `${((totalHeadroomWithHnsw / 512) * 100).toFixed(1)}%`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
