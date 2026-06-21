# Module A — Vercel AI SDK Deep Dive

An instructive analysis of every AI/LLM call in Module A (Developer-Centric Onboarding), written so you understand both **what** the code does and **how** the Vercel AI SDK works under the hood.

---

## 1. What AI SDK Packages Are Installed

| Package | Version | Role |
|---------|---------|------|
| `ai` | `^6.0.208` | The core Vercel AI SDK. Exports `generateObject`, `embedMany`, `generateText`, `streamText`, etc. |
| `@ai-sdk/openai` | `^3.0.73` | The OpenAI *provider*. Creates model instances that the core SDK consumes. |

**Key insight:** The Vercel AI SDK is *provider-agnostic*. `ai` contains the framework logic; `@ai-sdk/openai` is just one adapter. If you later switch to Anthropic, you would install `@ai-sdk/anthropic` and swap `openai(...)` for `anthropic(...)`. The rest of your code (prompts, schemas, error handling) stays identical.

---

## 2. The Two AI SDK Functions Module A Actually Uses

Module A only touches two functions from the entire `ai` package:

1. **`generateObject`** — structured LLM extraction
2. **`embedMany`** — batch embedding generation

There is **no streaming**, **no chat UI**, and **no tool calling** in Module A. The AI SDK is being used as a *backend utility*, not a conversational interface.

---

## 3. `generateObject` — Structured CV Extraction (The Big One)

### 3.1 Where It Lives

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" lines="137-143" />

### 3.2 What This Code Does

```typescript
const { object: extraction } = await generateObject({
  model: openai("gpt-4o"),
  schema: resumeExtractionSchema,
  system: PARSE_CV_SYSTEM_PROMPT,
  prompt: rawText,
});
```

This single call takes raw text extracted from a PDF resume and returns a fully typed, validated TypeScript object matching `resumeExtractionSchema`.

### 3.3 How `generateObject` Works Internally

When you call `generateObject`, the AI SDK does the following:

1. **Compiles your Zod schema into a JSON Schema.** The SDK uses `zod-to-json-schema` under the hood to convert your `resumeExtractionSchema` into a JSON Schema draft that OpenAI's API understands.

2. **Injects `.describe()` text as field instructions.** Every `.describe("...")` on your Zod fields becomes part of the system prompt automatically. This is *not* magic — the SDK appends a schema description to the system message so the model knows the semantic meaning of each field.

3. **Sends a single chat completion request** to OpenAI with:
   - `response_format: { type: "json_object" }` (or OpenAI's newer structured-outputs mode when supported)
   - Your `system` prompt
   - Your `prompt` as the user message

4. **Parses the raw JSON string** returned by the model into a JavaScript object.

5. **Validates the parsed object against your Zod schema.** If the model hallucinates a field, sends invalid types, or invents enum values, Zod rejects it and `generateObject` throws an error.

6. **Returns `{ object }`** where `object` is fully typed as `z.infer<typeof resumeExtractionSchema>`.

### 3.4 Why Zod + `generateObject` Is Powerful

Look at the schema:

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/schemas.ts" lines="32-119" />

Notice three things:

**A. `.describe()` drives model behavior**

```typescript
start_date: z.string()
  .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format")
  .describe("YYYY-MM format. If only year is available, use YYYY-01")
```

The regex enforces structure *after* the model returns data. The `.describe()` influences the model *before* it returns data. The AI SDK passes both to the model. Without `.describe()`, the LLM would return dates in random formats (`Jan 2020`, `2020`, `01/20`). With it, the model understands the contract.

**B. `.refine()` is your safety net against LLM hallucinations**

```typescript
.refine(
  (data) =>
    data.proposed_stacks.every((stack) =>
      stack.must_have_tags.some((tag) => PERSONA_DEFINING_TAGS.has(tag)),
    ),
  { message: "Each proposed stack must contain at least 1 persona_defining tag" },
);
```

Even with a strong system prompt, GPT-4o occasionally proposes a stack like `["css", "html", "sass", "bootstrap", "jquery"]` — all supporting tags, no anchor identity. The `.refine()` rule catches this *after* generation and causes `generateObject` to throw. The calling code then marks the CV parse as `invalid` and surfaces an error to the user.

**C. `.length(5)` forces exact array cardinality**

```typescript
must_have_tags: z.array(z.string())
  .length(5, "Each stack must have exactly 5 must_have_tags")
```

The AI SDK feeds this constraint into the model. GPT-4o is explicitly instructed (via the compiled schema) that this array must contain exactly 5 items. If it returns 4 or 6, Zod rejects the entire output.

### 3.5 The Prompt Engineering Strategy

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" lines="54-70" />

The system prompt is constructed dynamically from the canonical tag list:

```typescript
const CANONICAL_TAG_LIST = CANONICAL_TAGS.map((t) => t.tag).join(", ");
const PERSONA_DEFINING_TAG_LIST = Array.from(PERSONA_DEFINING_TAGS).join(", ");
```

This means the prompt contains the **entire dictionary** of ~130 canonical tags and ~20 persona-defining tags at call time. Why?

- **Without the tag list**, the LLM invents tags like `React.js` or `AWS Lambda` that don't exist in `CANONICAL_TAGS`. The Zod schema accepts any `string`, so the model would pass validation but the data would be unusable for Gate 1 (GIN index matching).
- **With the tag list**, the model maps skills to your controlled vocabulary. If the CV says "Amazon Web Services," the model knows to output `aws` because `aws` is explicitly listed in the prompt.

This is a **closed-vocabulary extraction** strategy. You are not asking the model to "extract skills" in the abstract; you are asking it to "classify each skill against this exact list."

### 3.6 Error Handling Around `generateObject`

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" lines="137-164" />

The `try/catch` does two critical things:

1. **On success:** Updates the `cvUpload` row to `status: "valid"` and stores the parsed JSON.
2. **On failure:** Updates the row to `status: "invalid"` and returns the error message.

This creates an **audit trail** for every upload. If a user complains that their CV "didn't work," you can query `cvUpload` and see exactly where it broke — was it an invalid PDF (pre-LLM check), or did GPT-4o return malformed JSON?

---

## 4. `embedMany` — Persona Embedding Generation

### 4.1 Where It Lives

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/embeddings.ts" lines="24-33" />

### 4.2 What This Code Does

```typescript
const { embeddings } = await embedMany({
  model: openai.embedding("text-embedding-3-small"),
  values: texts,
});
```

This takes an array of strings (one per persona's `embeddingSummary`) and returns an array of 1536-dimensional float vectors — one per input string, in the same order.

### 4.3 How `embedMany` Works Internally

1. **Batches your inputs** into a single OpenAI API call (`/v1/embeddings`) instead of calling the API N times.
2. **Returns `{ embeddings }`** where `embeddings` is `number[][]`.
3. **Maintains input order** — `embeddings[0]` corresponds to `values[0]`. This is crucial because the calling code maps them back to personas by index:

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" lines="286-296" />

### 4.4 Why `text-embedding-3-small`?

- **1536 dimensions** — dense enough for high-quality cosine similarity in Gate 2 (HNSW index).
- **Cheap** — ~30x cheaper than `text-embedding-3-large`.
- **Fast** — optimized for batch inference.

Module A only embeds 1-3 persona summaries per user. Even at scale, this is negligible cost. The larger model would not meaningfully improve matching quality for 50-500 character summaries.

### 4.5 The `generateEmbedding` Convenience Wrapper

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/embeddings.ts" lines="39-45" />

This is used in `recomputeTagsExperience` when a single persona needs its embedding regenerated (e.g., after tag deactivation). It simply calls `generateEmbeddings` with a single-element array and unwraps the result.

---

## 5. The Complete AI Data Flow (End-to-End)

Here is exactly how AI SDK functions are orchestrated across Module A:

```
User uploads PDF
       |
       v
[pdfjs-dist] extracts raw text (client-side, main thread)
       |
       v
[validateCvRawText] pre-LLM guard (200+ chars, contains a year)
       |
       v
[parseCvAction] Server Action
  |
  +---> [generateObject] gpt-4o parses text into structured resumeExtractionSchema
  |         |
  |         v
  |     { roles[], canonical_skills_detected[], proposed_stacks[] }
  |         |
  |         v
  +---> Stored in cvUpload.extractedJson (JSONB)
            |
            v
User reviews/corrects data in UI (State 2)
            |
            v
[finalizeOnboardingAction] Server Action
  |
  +---> [generateEmbeddings] text-embedding-3-small embeds each persona.embeddingSummary
  |         |
  |         v
  |     number[][] (1 vector per persona)
  |         |
  |         v
  +---> db.transaction()
          |
          +---> Upsert applicant
          +---> Insert workingHistory
          +---> [recomputeTagsExperience] (merge date ranges, compute years)
          +---> Insert persona rows with pre-generated embeddings
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Embeddings generated **before** the DB transaction | If OpenAI's API is down, the transaction never starts. No partial rows. |
| `generateObject` called **inside** `try/catch` | Failed LLM calls mark `cvUpload.status = "invalid"` rather than crashing the server. |
| Zod schema passed directly to `generateObject` | Type safety from prompt to database. The LLM output is validated at runtime against the same schema that types your variables. |
| No `streamText` / `streamObject` | CV parsing is a batch operation, not a chat. Streaming adds complexity with no UX benefit. |
| `embedMany` not `embed` (single) | Even for 1-3 personas, `embedMany` is the idiomatic API. It ensures batching if you ever increase persona limits. |

---

## 6. AI SDK Provider Setup

There is no global client initialization. You simply import the provider and instantiate a model inline:

```typescript
import { openai } from "@ai-sdk/openai";
import { generateObject, embedMany } from "ai";

// Model instance — just a configuration object
const model = openai("gpt-4o");

// Passed to generateObject
await generateObject({ model, ... });

// Embedding model instance
const embeddingModel = openai.embedding("text-embedding-3-small");

// Passed to embedMany
await embedMany({ model: embeddingModel, ... });
```

The `openai(...)` function reads `process.env.OPENAI_API_KEY` automatically. There is no `new OpenAI({ apiKey: ... })` boilerplate. This is the AI SDK's convention: providers read environment variables via their internal config layer.

---

## 7. What the AI SDK Is *Not* Doing in Module A

It is easy to over-engineer LLM integrations. Module A deliberately avoids these AI SDK features:

| Feature | Why Not Used |
|---------|-------------|
| `streamText` / `streamObject` | No chat UI; user waits for the full parse result anyway. |
| `generateText` (unstructured) | Raw text would require manual JSON parsing. `generateObject` handles parsing + validation. |
| Tools / function calling | No need for the model to call external functions during CV extraction. |
| Chat messages array (`messages: [...]`) | Single-turn extraction (system + user prompt). No conversation history. |
| `maxTokens`, `temperature`, `topP` | Default model behavior is sufficient. The schema constraints guide output more than sampling parameters. |
| Multi-modal (`image`, `file`) | Only text PDFs are supported in MVP. |

---

## 8. Testing the AI SDK Integration

### Unit Tests (No LLM Calls)

The schema tests verify that Zod constraints work correctly:

<ref_snippet file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/__tests__/schemas.test.ts" lines="85-146" />

These tests are **fast** and **deterministic** because they test the Zod schema directly, not the LLM. They prove that if GPT-4o returns bad data, the schema will catch it.

### Integration Tests (Mocked LLM)

You would mock `generateObject` and `embedMany` in any Server Action tests:

```typescript
import { vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(async ({ prompt }) => ({
    object: mockExtractionFor(prompt),
  })),
  embedMany: vi.fn(async ({ values }) => ({
    embeddings: values.map(() => new Array(1536).fill(0.1)),
  })),
}));
```

This lets you test `parseCvAction` and `finalizeOnboardingAction` without spending real API tokens or relying on OpenAI's availability.

---

## 9. Summary: AI SDK as a Typed Bridge

The Vercel AI SDK's role in Module A is best understood as a **typed bridge** between natural language (resumes) and structured data (your database).

| Without AI SDK | With AI SDK |
|----------------|-------------|
| Raw OpenAI API: manually construct JSON Schema, parse JSON string, validate types, handle errors | `generateObject({ schema, prompt })` — one call, typed output, automatic validation |
| Raw OpenAI API: loop over texts, call `/v1/embeddings` N times | `embedMany({ values })` — one call, batched, preserves order |
| Type safety gap: LLM returns `any`, you cast and hope | Zod schema is the single source of truth for both the model and your TypeScript types |

The implementation is deliberately minimal — two functions, two models, one provider — because the complexity of Module A is in the *business logic* (date merging, canonical tag mapping, transaction orchestration), not in the LLM plumbing. The AI SDK's value is that it lets you focus on that business logic instead of wrestling with API request shapes and JSON parsing.

---

## File Index

All files referenced in this analysis:

- <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" /> — Server Actions (`parseCvAction`, `finalizeOnboardingAction`)
- <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/embeddings.ts" /> — Embedding generation utility
- <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/schemas.ts" /> — Zod schemas for `generateObject`
- <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/recompute-tags.ts" /> — Tag re-aggregation + embedding regeneration
- <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/__tests__/schemas.test.ts" /> — Schema unit tests
