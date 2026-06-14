-- Database Schema for vectormatch
-- Generated from Drizzle ORM schema files
-- PostgreSQL with Neon

-- ENUMS
CREATE TYPE "status" AS ENUM ('draft', 'published', 'archived');

-- AUTH TABLES
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" BOOLEAN DEFAULT false NOT NULL,
  "image" TEXT,
  "role" TEXT DEFAULT 'user',
  "banned" BOOLEAN DEFAULT false,
  "ban_reason" TEXT,
  "ban_expires" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMP,
  "refresh_token_expires_at" TIMESTAMP,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account"("user_id");

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "impersonated_by" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session"("user_id");

CREATE TABLE "rate_limit" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "last_request" BIGINT NOT NULL,
  "expires_at" TIMESTAMP DEFAULT now() NOT NULL,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL
);
CREATE INDEX "rate_limit_expires_at_idx" ON "rate_limit"("expires_at");

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- BLOG TABLES
CREATE TABLE "category" (
  "id" INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE "tag" (
  "id" INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE "post" (
  "id" INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" VARCHAR(500) NOT NULL,
  "slug" VARCHAR(500) NOT NULL UNIQUE,
  "short_description" TEXT,
  "content" TEXT NOT NULL,
  "category_id" INTEGER REFERENCES "category"("id") ON DELETE SET NULL,
  "status" "status" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE "post_tags" (
  "post_id" INTEGER NOT NULL REFERENCES "post"("id") ON DELETE CASCADE,
  "tag_id" INTEGER NOT NULL REFERENCES "tag"("id") ON DELETE CASCADE,
  PRIMARY KEY ("post_id", "tag_id")
);

CREATE TABLE "comment" (
  "id" INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "parent_id" INTEGER REFERENCES "comment"("id") ON DELETE SET NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "post_id" INTEGER NOT NULL REFERENCES "post"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT now() NOT NULL
);
