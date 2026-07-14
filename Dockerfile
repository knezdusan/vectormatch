# =============================================================================
# VectorMatch — Multi-arch Dockerfile for Coolify (Module E)
# =============================================================================
# Next.js standalone output, Node 24, non-root user, healthcheck.
# Arch-agnostic: node:24-slim ships both amd64 and arm64, so this Dockerfile
# builds natively on whatever host Coolify runs (CX33 x86 / CAX21 ARM64).
#
# Build pack: set Coolify → Build Pack = "Dockerfile", Ports Exposes = 3000.
# No build-time secrets required: src/db/db.ts lazily creates the Neon Pool on
# first request, so DATABASE_URL is a runtime env var only (Coolify dashboard).
# =============================================================================

ARG NODE_VERSION=24-slim

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Copy lockfile first to leverage Docker layer caching.
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies) — Next.js build needs
# devDeps (typescript, @biomejs/biome, tailwindcss, etc.). NODE_ENV is left
# unset so npm installs both prod + dev. The runner stage excludes node_modules
# entirely (standalone output traces only the needed files).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Increase the Node.js heap for the TypeScript type-check step. Without this,
# large builds can be OOM-killed inside the Docker build container.
ENV NODE_OPTIONS=--max-old-space-size=4096

# Build Next.js with standalone output (next.config.ts → output: "standalone").
# --mount cache for .next/cache speeds up rebuilds without leaking fetch-cache
# into the runner image.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Runner (minimal production image)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Install curl for Coolify's healthcheck probe (node:24-slim ships without it).
# Coolify runs its own healthcheck via curl/wget, separate from the Dockerfile
# HEALTHCHECK directive. Run as root before USER node.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy static public assets.
COPY --from=builder --chown=node:node /app/public ./public

# Create .next with correct ownership for the prerender cache.
# Must run as root (USER node is set below, after all root-requiring steps).
RUN mkdir -p .next && chown node:node .next

# Standalone server + traced node_modules (minimal, no full node_modules).
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Static chunks (CSS, JS) served from .next/static.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Switch to non-root user only after all root-requiring filesystem steps.
USER node

EXPOSE 3000

# Healthcheck — Next.js standalone server responds on the root path.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
