import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export const assignmentTypeEnum = pgEnum("assignment_type", [
  "remote",
  "hybrid",
  "on-site",
  "remote_local",
]);

export const modalityEnum = pgEnum("modality", [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
]);

export const complianceEnum = pgEnum("compliance", [
  // --- Employee / Payroll Options ---
  "w2", // US Corporate Employment
  "local_employment", // Standard domestic employment (direct hire in dev's country)
  "eor", // Employer of Record (Global full-time via Deel/Remote/etc.)

  // --- Business-to-Business (Corporate) ---
  "b2b", // Company-to-Company (Serbian Sole Proprietorship, UK Outside IR35, LLCs)

  // --- Independent Contractor / Freelance (Individual) ---
  "1099", // US Resident Solo Contractor (Requires W-9 & IRS 1099-NEC filing)
  "w8ben", // Foreign Solo Contractor for US Client (0% US tax withholding, exempt from IRS reporting)
  "ic_global", // International Solo Contractor for non-US Client (filing taxes locally)
]);

export const statusEnum = pgEnum("status", ["draft", "published", "archived"]);

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Base insert schema: user-provided fields with validation (omits all auto-generated fields)
export const userSchema = createInsertSchema(user, {
  name: (schema) =>
    schema
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name too long"),
  email: (schema) =>
    schema.email("Invalid email address").max(255, "Email too long"),
  image: (schema) => schema.url("Invalid image URL"),
}).pick({
  name: true,
  email: true,
  image: true,
});

// Sign-up form: name + email (from userSchema) + plain-text password
export const signUpSchema = userSchema.omit({ image: true }).extend({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});

// Sign-in form: email (reuses userSchema validation) + plain-text password
export const signInSchema = userSchema.pick({ email: true }).extend({
  password: z.string().min(1, "Password is required"),
});

export type UserSchema = z.infer<typeof userSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const accountSchema = createInsertSchema(account);
export type AccountSchema = z.infer<typeof accountSchema>;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const sessionSchema = createInsertSchema(session);
export type SessionSchema = z.infer<typeof sessionSchema>;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    // Better Auth v1.6+ sliding-window algorithm stores last request as Unix ms.
    // Must be bigint — Date.now() exceeds INTEGER max (~2.1 billion).
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at")
      .$defaultFn(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("rate_limit_expires_at_idx").on(table.expiresAt)],
);

export const rateLimitSchema = createInsertSchema(rateLimit);
export type RateLimitSchema = z.infer<typeof rateLimitSchema>;

export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const verificationSchema = createInsertSchema(verification);
export type VerificationSchema = z.infer<typeof verificationSchema>;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

// ============================================================================
// BLOG SCHEMAS
// ============================================================================

export const categoriesTable = pgTable("category", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const categorySchema = createInsertSchema(categoriesTable);
export type CategorySchema = z.infer<typeof categorySchema>;

export type Category = typeof categoriesTable.$inferSelect;
export type NewCategory = typeof categoriesTable.$inferInsert;

export const tagsTable = pgTable("tag", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const tagSchema = createInsertSchema(tagsTable);
export type TagSchema = z.infer<typeof tagSchema>;

export type Tag = typeof tagsTable.$inferSelect;
export type NewTag = typeof tagsTable.$inferInsert;

export const postsTable = pgTable("post", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull().unique(),
  shortDescription: text("short_description"),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  status: statusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const postTagsTable = pgTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

const postFieldsSchema = createInsertSchema(postsTable, {
  title: (schema) => schema.min(1),
  slug: (schema) => schema.min(1),
  shortDescription: (schema) => schema.min(1).max(255).optional(),
  content: (schema) => schema.min(1),
  userId: (schema) => schema.min(1),
  categoryId: (schema) => schema.min(1).optional(),
})
  .pick({
    title: true,
    slug: true,
    shortDescription: true,
    content: true,
    userId: true,
    categoryId: true,
  })
  .extend({
    tagIds: z.array(z.number().int().min(1)),
  });

export const postSchema = z.discriminatedUnion("mode", [
  postFieldsSchema.extend({
    mode: z.literal("create"),
  }),
  postFieldsSchema.extend({
    mode: z.literal("edit"),
    id: z.number().int().min(1),
  }),
]);

export type PostSchema = z.infer<typeof postSchema>;

export const postTagSchema = createInsertSchema(postTagsTable);
export type PostTagSchema = z.infer<typeof postTagSchema>;

export type Post = typeof postsTable.$inferSelect;
export type NewPost = typeof postsTable.$inferInsert;
export type PostTag = typeof postTagsTable.$inferSelect;

export const commentsTable = pgTable("comment", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => commentsTable.id,
    {
      onDelete: "set null",
    },
  ),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const commentSchema = createInsertSchema(commentsTable, {
  content: (schema) => schema.min(1),
  userId: (schema) => schema.min(1),
  postId: (schema) => schema.min(1),
}).pick({
  content: true,
  userId: true,
  parentId: true,
  postId: true,
});

export type CommentSchema = z.infer<typeof commentSchema>;

export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;

// ============================================================================
// JOBS SCHEMAS
// ============================================================================

export const applicant = pgTable("applicant", {
  // 1:1 Relationship constraint & Primary Key
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  isOnboarded: boolean("is_onboarded").default(false),
  country: text("country"), // ISO 3166-1 alpha-2
  canWorkUsHours: boolean("can_work_us_hours"),

  assignmentTypes: assignmentTypeEnum("assignment_types").array(),
  modalities: modalityEnum("modalities").array(),
  preferredCompliance: complianceEnum("preferred_compliance").array(),

  // The global knowledge base for Gate 3 LLM evaluation
  allTags: text("all_tags").array().notNull().default(sql`'{}'::text[]`),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const applicantSchema = createInsertSchema(applicant);
export type ApplicantSchema = z.infer<typeof applicantSchema>;

export type Applicant = typeof applicant.$inferSelect;
export type NewApplicant = typeof applicant.$inferInsert;

export const job = pgTable(
  "job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atsSource: text("ats_source").notNull(),
    atsSlug: text("ats_slug").notNull(),
    title: text("title").notNull(),
    rawJson: text("raw_json").notNull(),
    extractedTags: text("extracted_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    jobEmbedding: vector("job_embedding", { dimensions: 1536 }),
    detectedAt: timestamp("detected_at").defaultNow(),
  },
  (table) => ({
    extractedTagsIdx: index("jobs_extracted_tags_idx").using(
      "gin",
      table.extractedTags,
    ),
    embeddingIdx: index("job_embedding_hnsw_idx").using(
      "hnsw",
      table.jobEmbedding.op("vector_cosine_ops"),
    ),
  }),
);

export const jobSchema = createInsertSchema(job);
export type JobSchema = z.infer<typeof jobSchema>;

export type Job = typeof job.$inferSelect;
export type NewJob = typeof job.$inferInsert;

export const persona = pgTable(
  "persona",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    personaId: text("persona_id").notNull(), // e.g., "react_frontend"
    personaLabel: text("persona_label").notNull(), // e.g., "Senior React Developer"
    embeddingSummary: text("embedding_summary").notNull(), // Dense 3-sentence summary for LLM context
    personaEmbedding: vector("persona_embedding", { dimensions: 1536 }), // text-embedding-3-small

    mustHaveTags: text("must_have_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    blocklistTags: text("blocklist_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => ({
    mustHaveTagsIdx: index("persona_must_have_tags_idx").using(
      "gin",
      table.mustHaveTags,
    ),
    blocklistTagsIdx: index("persona_blocklist_tags_idx").using(
      "gin",
      table.blocklistTags,
    ),
    embeddingIdx: index("persona_embedding_hnsw_idx").using(
      "hnsw",
      table.personaEmbedding.op("vector_cosine_ops"),
    ),
    applicantIdIdx: index("persona_applicant_id_idx").on(table.applicantId),
  }),
);

export const personaSchema = createInsertSchema(persona);
export type PersonaSchema = z.infer<typeof personaSchema>;

export type Persona = typeof persona.$inferSelect;
export type NewPersona = typeof persona.$inferInsert;

export const matchQueue = pgTable(
  "match_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    overlapScore: integer("overlap_score").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueMatch: index("match_queue_unique").on(table.jobId, table.applicantId),
  }),
);

export const matchQueueSchema = createInsertSchema(matchQueue);
export type MatchQueueSchema = z.infer<typeof matchQueueSchema>;

export type MatchQueue = typeof matchQueue.$inferSelect;
export type NewMatchQueue = typeof matchQueue.$inferInsert;

// ============================================================================
// RELATIONS
// ============================================================================

// AUTH RELATIONS
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  posts: many(postsTable),
  comments: many(commentsTable),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// JOBS RELATIONS
export const applicantRelations = relations(applicant, ({ one, many }) => ({
  user: one(user, {
    fields: [applicant.userId],
    references: [user.id],
  }),
  personas: many(persona),
  matches: many(matchQueue),
}));

export const jobRelations = relations(job, ({ many }) => ({
  matches: many(matchQueue),
}));

export const personaRelations = relations(persona, ({ one }) => ({
  applicant: one(applicant, {
    fields: [persona.applicantId],
    references: [applicant.userId],
  }),
}));

export const matchQueueRelations = relations(matchQueue, ({ one }) => ({
  job: one(job, {
    fields: [matchQueue.jobId],
    references: [job.id],
  }),
  applicant: one(applicant, {
    fields: [matchQueue.applicantId],
    references: [applicant.userId],
  }),
}));

// BLOG RELATIONS
export const categoryRelations = relations(categoriesTable, ({ many }) => ({
  posts: many(postsTable),
}));

export const tagRelations = relations(tagsTable, ({ many }) => ({
  postTags: many(postTagsTable),
}));

export const postRelations = relations(postsTable, ({ one, many }) => ({
  user: one(user, {
    fields: [postsTable.userId],
    references: [user.id],
  }),
  category: one(categoriesTable, {
    fields: [postsTable.categoryId],
    references: [categoriesTable.id],
  }),
  postTags: many(postTagsTable),
  comments: many(commentsTable),
}));

export const postTagRelations = relations(postTagsTable, ({ one }) => ({
  post: one(postsTable, {
    fields: [postTagsTable.postId],
    references: [postsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [postTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

export const commentRelations = relations(commentsTable, ({ one, many }) => ({
  user: one(user, {
    fields: [commentsTable.userId],
    references: [user.id],
  }),
  post: one(postsTable, {
    fields: [commentsTable.postId],
    references: [postsTable.id],
  }),
  parent: one(commentsTable, {
    fields: [commentsTable.parentId],
    references: [commentsTable.id],
    relationName: "comment_replies",
  }),
  replies: many(commentsTable, { relationName: "comment_replies" }),
}));
