#!/usr/bin/env bash
#
# D20 JOB 5.1: Nightly Postgres backup → Google Cloud Storage
#
# Installs as a VPS cron job. Runs pg_dump, uploads to GCS, alerts on failure.
#
# INSTALL (one-time, SSH into VPS):
#   1. Copy this script to /opt/vectormatch/backup-pg.sh
#   2. chmod +x /opt/vectormatch/backup-pg.sh
#   3. Create the GCS bucket (one-time):
#        gsutil mb -l EU -p vactormatch-seeder gs://vectormatch-pg-backups
#        gsutil lifecycle set /opt/vectormatch/backup-lifecycle.json gs://vectormatch-pg-backups
#   4. Save the GCP service account key to /opt/vectormatch/gcp-sa.json
#      (decode GOOGLE_APPLICATION_CREDENTIALS_B64 from .env and write the JSON)
#   5. Install gsutil (if not present):
#        apt-get install -y apt-transport-https ca-certificates gnupg
#        echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee /etc/apt/sources.list.d/google-cloud-sdk.list
#        curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
#        apt-get update && apt-get install -y google-cloud-cli
#        gcloud auth activate-service-account --key-file=/opt/vectormatch/gcp-sa.json
#   6. Add to crontab (root):
#        crontab -e
#        # Add: Nightly Postgres backup at 02:00 UTC
#        0 2 * * * /opt/vectormatch/backup-pg.sh >> /var/log/vectormatch-backup.log 2>&1
#
# ALERTING: On failure, sends a POST to the Inngest event endpoint which
# triggers a visible run in the Inngest dashboard. The founder checks the
# dashboard daily — a failed backup shows as a red run.
#
# RETENTION: 30-day lifecycle policy on the GCS bucket (see backup-lifecycle.json).
# Older backups are auto-deleted by GCS.

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
# Postgres runs in a Docker container (pgvector/pgvector:pg17), exposed on
# host port 25432. We use docker exec to run pg_dump inside the container
# (pg_dump is not installed on the host).
PG_CONTAINER="z10g6zz09soe0ddwgpizteq2"
PG_DB="vectormatch"
PG_USER="vectormatch"
PG_PASSWORD="REDACTED_PG_PASSWORD"
GCS_BUCKET="vectormatch-pg-backups"
GCP_SA_KEY="/opt/vectormatch/gcp-sa.json"
GCP_PROJECT="vactormatch-seeder"

# Alert webhook — emits an Inngest event that shows as a failed run in dashboard
INNGEST_URL="https://inngest.vectormatch.dev"
INNGEST_EVENT_KEY="${INNGEST_EVENT_KEY:-REDACTED_INNGEST_KEY}"

# ── Helpers ──────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_DIR=$(date -u +"%Y/%m")
BACKUP_FILE="vectormatch-${TIMESTAMP}.dump"
BACKUP_PATH="/tmp/${BACKUP_FILE}"
GCS_URI="gs://${GCS_BUCKET}/${DATE_DIR}/${BACKUP_FILE}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

alert_failure() {
  local reason="$1"
  log "ALERT: Backup failed — ${reason}"
  # Emit a backup/failed event to Inngest — shows as a red run in dashboard
  curl -s -X POST \
    "${INNGEST_URL}/e/${INNGEST_EVENT_KEY}" \
    -H "Content-Type: application/json" \
    -d "[{
      \"id\": \"backup-failed-${TIMESTAMP}\",
      \"name\": \"backup/failed\",
      \"ts\": $(date +%s)000,
      \"data\": {
        \"reason\": \"${reason}\",
        \"timestamp\": \"${TIMESTAMP}\",
        \"gcs_uri\": \"${GCS_URI}\"
      }
    }]" >/dev/null 2>&1 || true
}

alert_success() {
  local size="$1"
  local duration="$2"
  log "SUCCESS: Backup uploaded to ${GCS_URI} (${size} in ${duration}s)"
  # Emit a backup/succeeded event — shows as a green run in dashboard
  curl -s -X POST \
    "${INNGEST_URL}/e/${INNGEST_EVENT_KEY}" \
    -H "Content-Type: application/json" \
    -d "[{
      \"id\": \"backup-succeeded-${TIMESTAMP}\",
      \"name\": \"backup/succeeded\",
      \"ts\": $(date +%s)000,
      \"data\": {
        \"timestamp\": \"${TIMESTAMP}\",
        \"gcs_uri\": \"${GCS_URI}\",
        \"size_bytes\": ${size},
        \"duration_seconds\": ${duration}
      }
    }]" >/dev/null 2>&1 || true
}

# ── Main ─────────────────────────────────────────────────────────────────────
START_TIME=$(date +%s)
log "Starting nightly Postgres backup..."

# Step 1: pg_dump via docker exec (custom format — compressed, parallel-restore)
# The container has pg_dump matching the server version. We dump to a temp
# file inside the container, then docker cp it out to the host.
# (Can't use /dev/stdout — pg_dump --format=custom calls fsync which fails
# on /dev/stdout.)
CONTAINER_DUMP_PATH="/tmp/${BACKUP_FILE}"
log "Running pg_dump via docker exec (container: ${PG_CONTAINER})"
if ! docker exec -e PGPASSWORD="${PG_PASSWORD}" \
  -e PGUSER="${PG_USER}" \
  -e PGDATABASE="${PG_DB}" \
  -e CONTAINER_DUMP_PATH="${CONTAINER_DUMP_PATH}" \
  "${PG_CONTAINER}" \
  bash -c 'pg_dump \
    --username="${PGUSER}" \
    --dbname="${PGDATABASE}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="${CONTAINER_DUMP_PATH}" 2>&1' > /tmp/pgdump-err; then
  alert_failure "pg_dump failed: $(cat /tmp/pgdump-err | tail -5)"
  docker exec "${PG_CONTAINER}" rm -f "${CONTAINER_DUMP_PATH}" 2>/dev/null || true
  rm -f /tmp/pgdump-err
  exit 1
fi
rm -f /tmp/pgdump-err

# Copy the dump from the container to the host
log "Copying dump from container to host"
if ! docker cp "${PG_CONTAINER}:${CONTAINER_DUMP_PATH}" "${BACKUP_PATH}" 2>/tmp/dockercp-err; then
  alert_failure "docker cp failed: $(cat /tmp/dockercp-err | tail -5)"
  docker exec "${PG_CONTAINER}" rm -f "${CONTAINER_DUMP_PATH}" 2>/dev/null || true
  rm -f "${BACKUP_PATH}" /tmp/dockercp-err
  exit 1
fi
rm -f /tmp/dockercp-err

# Cleanup the dump inside the container
docker exec "${PG_CONTAINER}" rm -f "${CONTAINER_DUMP_PATH}" 2>/dev/null || true

BACKUP_SIZE=$(stat -c%s "${BACKUP_PATH}" 2>/dev/null || stat -f%z "${BACKUP_PATH}")
log "pg_dump complete: $(numfmt --to=iec ${BACKUP_SIZE} 2>/dev/null || echo ${BACKUP_SIZE} bytes)"

# Step 2: Upload to GCS
log "Uploading to ${GCS_URI}"

# Ensure gsutil is authenticated
if ! gcloud auth list --filter="account:vectormatch-seeder@vactormatch-seeder.iam.gserviceaccount.com" --format="value(account)" 2>/dev/null | grep -q "vectormatch-seeder"; then
  gcloud auth activate-service-account --key-file="${GCP_SA_KEY}" 2>/dev/null || {
    alert_failure "gcloud auth failed — SA key invalid or missing at ${GCP_SA_KEY}"
    rm -f "${BACKUP_PATH}"
    exit 1
  }
fi
gcloud config set project "${GCP_PROJECT}" 2>/dev/null

if ! gsutil cp "${BACKUP_PATH}" "${GCS_URI}" 2>/tmp/gsutil-err; then
  # gsutil writes "Google recommends..." warning to stderr even on success,
  # so check if the file actually landed before declaring failure
  if gsutil ls "${GCS_URI}" >/dev/null 2>&1; then
    log "Upload verified (gsutil warning ignored)"
  else
    alert_failure "gsutil upload failed: $(cat /tmp/gsutil-err | tail -5)"
    rm -f "${BACKUP_PATH}" /tmp/gsutil-err
    exit 1
  fi
fi
rm -f /tmp/gsutil-err

# Step 3: Cleanup local temp file
rm -f "${BACKUP_PATH}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Step 4: Alert success
alert_success "${BACKUP_SIZE}" "${DURATION}"

log "Backup complete in ${DURATION}s"
