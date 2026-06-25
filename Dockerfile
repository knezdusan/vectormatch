# Stage 1: Dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Public env vars baked at build time
ARG NEXT_PUBLIC_SITE_URL=https://vectormatch.dev
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

ARG NEXT_PUBLIC_GISCUS_REPO=knezdusan/vectormatch
ENV NEXT_PUBLIC_GISCUS_REPO=$NEXT_PUBLIC_GISCUS_REPO

ARG NEXT_PUBLIC_GISCUS_REPO_ID=R_kgDOSuJmlw
ENV NEXT_PUBLIC_GISCUS_REPO_ID=$NEXT_PUBLIC_GISCUS_REPO_ID

ARG NEXT_PUBLIC_GISCUS_CATEGORY=Announcements
ENV NEXT_PUBLIC_GISCUS_CATEGORY=$NEXT_PUBLIC_GISCUS_CATEGORY

ARG NEXT_PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDOSuJml84C_N4t
ENV NEXT_PUBLIC_GISCUS_CATEGORY_ID=$NEXT_PUBLIC_GISCUS_CATEGORY_ID

# Required at build time for static generation (db.ts module init)
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG BETTER_AUTH_SECRET
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

ARG BETTER_AUTH_URL=https://vectormatch.dev
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL

RUN npm run build

# Stage 3: Runner
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
