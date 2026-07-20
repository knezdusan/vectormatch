#!/usr/bin/env bash
#
# D20 JOB 5.2: VPS resource monitor — disk + RAM watch
#
# Runs every 15 minutes via cron. Alerts via Inngest when:
#   - Disk usage > 80%
#   - RAM usage > 80%
#   - Available RAM < 512MB (critical — OOM risk, no swap configured)
#
# INSTALL (one-time, SSH into VPS):
#   1. Copy this script to /opt/vectormatch/resource-monitor.sh
#   2. chmod +x /opt/vectormatch/resource-monitor.sh
#   3. Add to crontab (root):
#        */15 * * * * /opt/vectormatch/resource-monitor.sh >> /var/log/vectormatch-monitor.log 2>&1
#
# ALERTING: Emits resource/alert events to Inngest. Each alert includes the
# current values so the founder can see the trend in the Inngest dashboard.

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
DISK_THRESHOLD=80
RAM_THRESHOLD=80
RAM_CRITICAL_MB=512  # Available RAM below this = critical (OOM risk, no swap)

INNGEST_URL="https://inngest.vectormatch.dev"
INNGEST_EVENT_KEY="${INNGEST_EVENT_KEY:-REDACTED_INNGEST_KEY}"

# ── Helpers ──────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

emit_alert() {
  local severity="$1"   # "warning" or "critical"
  local metric="$2"     # "disk" or "ram"
  local value="$3"      # current value
  local threshold="$4"  # threshold that was crossed
  local details="$5"    # additional context

  log "ALERT [${severity}]: ${metric} at ${value} (threshold: ${threshold}) — ${details}"

  curl -s -X POST \
    "${INNGEST_URL}/e/${INNGEST_EVENT_KEY}" \
    -H "Content-Type: application/json" \
    -d "[{
      \"id\": \"resource-alert-${TIMESTAMP}-${metric}\",
      \"name\": \"resource/alert\",
      \"ts\": $(date +%s)000,
      \"data\": {
        \"severity\": \"${severity}\",
        \"metric\": \"${metric}\",
        \"value\": \"${value}\",
        \"threshold\": \"${threshold}\",
        \"details\": \"${details}\",
        \"timestamp\": \"${TIMESTAMP}\"
      }
    }]" >/dev/null 2>&1 || true
}

# ── Disk check ───────────────────────────────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
DISK_USED=$(df -h / | awk 'NR==2 {print $3}')
DISK_TOTAL=$(df -h / | awk 'NR==2 {print $2}')
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')

if [ "${DISK_PCT}" -ge "${DISK_THRESHOLD}" ]; then
  emit_alert "warning" "disk" "${DISK_PCT}%" "${DISK_THRESHOLD}%" \
    "Used ${DISK_USED} of ${DISK_TOTAL}, ${DISK_AVAIL} available"
fi

# ── RAM check ────────────────────────────────────────────────────────────────
# /proc/meminfo fields: MemTotal, MemFree, MemAvailable, SwapTotal, SwapFree
RAM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
RAM_AVAIL_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
SWAP_TOTAL_KB=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
RAM_TOTAL_MB=$((RAM_TOTAL_KB / 1024))
RAM_AVAIL_MB=$((RAM_AVAIL_KB / 1024))
RAM_USED_MB=$((RAM_TOTAL_MB - RAM_AVAIL_MB))
RAM_USED_PCT=$((RAM_USED_MB * 100 / RAM_TOTAL_MB))
SWAP_TOTAL_MB=$((SWAP_TOTAL_KB / 1024))

if [ "${RAM_AVAIL_MB}" -lt "${RAM_CRITICAL_MB}" ]; then
  emit_alert "critical" "ram" "${RAM_AVAIL_MB}MB available" "${RAM_CRITICAL_MB}MB" \
    "RAM used ${RAM_USED_MB}MB / ${RAM_TOTAL_MB}MB (${RAM_USED_PCT}%), swap=${SWAP_TOTAL_MB}MB — OOM risk"
elif [ "${RAM_USED_PCT}" -ge "${RAM_THRESHOLD}" ]; then
  emit_alert "warning" "ram" "${RAM_USED_PCT}%" "${RAM_THRESHOLD}%" \
    "RAM used ${RAM_USED_MB}MB / ${RAM_TOTAL_MB}MB, ${RAM_AVAIL_MB}MB available, swap=${SWAP_TOTAL_MB}MB"
fi

# ── Summary (logged, no alert) ───────────────────────────────────────────────
log "OK: disk ${DISK_PCT}% (${DISK_USED}/${DISK_TOTAL}), RAM ${RAM_USED_PCT}% (${RAM_USED_MB}MB/${RAM_TOTAL_MB}MB, ${RAM_AVAIL_MB}MB avail, swap=${SWAP_TOTAL_MB}MB)"
