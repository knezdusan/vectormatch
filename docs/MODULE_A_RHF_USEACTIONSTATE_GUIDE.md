# Module A — React Hook Form + `useActionState`: How They Compose

An instructive walkthrough of the hybrid form architecture used in Module A
(onboarding). This document is a teaching companion to the implementation, not
a spec. Read it alongside the real files referenced throughout.

> **Governing decision (MODULE_A_DECISIONS.md §7):**
> *"These compose, they do not compete."*
> - **React Hook Form** manages client-side form state (field values, validation, drag-and-drop).
> - **`useActionState`** wraps the server-side submission (Server Action).
> - **Zod** validates at both layers (RHF resolver for client, Server Action for server).

---

## 1. The Mental Model — Two Tools, Two Jobs

The single most important thing to internalize is that **React Hook Form (RHF)
and `useActionState` solve two different problems** that happen to live inside
the same `<form>`:

| Concern | Owner | Where it runs |
|---|---|---|
| Field values, typing, dirty state, field-level errors, drag-and-drop arrays | **React Hook Form** | Browser (client) |
| Calling the server, awaiting the result, surfacing server errors, `isPending` | **`useActionState`** | Bridges client → server |
| Final source of truth for what gets persisted | **Server Action** + Zod | Server only |

A common mistake is to think of them as competing form libraries. They are not.
RHF never talks to the server. `useActionState` never manages field state. The
form is a **pipeline**: RHF owns the left half (user → validated client state),
`useActionState` owns the right half (validated client state → server → result),
and a tiny **bridge** in the middle hands data from one to the other.

```
 ┌─────────────────────────── CLIENT ───────────────────────────┐    ┌─── SERVER ───┐
 │                                                              │    │              │
 │  user input → [RHF: state + Zod validation] ──┐              │    │              │
 │                                               │ bridge       │    │              │
 │                                               ▼              │    │              │
 │  [useActionState: FormData → formAction] ──> Server Action ──────>  Zod + DB   │
 │                                               │              │    │              │
 │                                               ▼              │    │              │
 │  useEffect watches `state` ←──────────────  result           │    │              │
 │                                               │              │    │              │
 │  toast / router.refresh()                     │              │    │              │
 └───────────────────────────────────────────────┴──────────────┘    └──────────────┘
```

Module A actually uses **two patterns**. Looking at them side by side is the
fastest way to understand when each tool earns its place.

---

## 2. Pattern A — `useActionState` Alone (the simple case)

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/CvUploadForm.tsx" />

`CvUploadForm` (State 1) is a small form: a text label and a file picker. There
is no complex nested state, no drag-and-drop, no array fields. RHF would be
overkill, so the form uses **`useActionState` alone** with plain `useState` for
the two fields.

```tsx
const [state, formAction, isPending] = useActionState(parseCvAction, null);
const [file, setFile] = useState<File | null>(null);
const [label, setLabel] = useState("");
```

The three elements of the `useActionState` tuple:

1. **`state`** — whatever the Server Action returns. Typed as `ParseCvState`
   (`{ error, cvUploadId, extraction } | null`). Starts as `null`.
2. **`formAction`** — a function you call with a `FormData` to trigger the
   Server Action. It must be called inside a React transition (more on this
   below).
3. **`isPending`** — boolean, true while the action is in flight. Used to
   disable inputs and show a spinner.

### The two-stage submit

This form has a twist: before calling the server, it must run a **Web Worker**
to extract PDF text on the client. So it cannot use the naive
`<form action={formAction}>` pattern. Instead it intercepts the native submit,
does the worker work, then calls `formAction` programmatically:

```tsx
const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();                 // stop the native submission
  if (!file || !label.trim()) return;

  // Stage 1: client-side work (Web Worker)
  const { rawText } = await extractPdfText(file);

  // Stage 2: build a FormData and hand it to the Server Action
  const formData = new FormData();
  formData.set("label", label.trim());
  formData.set("originalFileName", file.name);
  formData.set("rawText", rawText);

  startTransition(() => {                 // useActionState requires a transition
    formAction(formData);
  });
};
```

Two non-obvious details worth memorizing:

- **`FormData` is the wire format.** Server Actions receive a `FormData`, not a
  JS object. You set string keys with `formData.set("name", value)`. On the
  server you read them back with `formData.get("name")`. There is no JSON here.
- **`startTransition` is mandatory when calling `formAction` manually.**
  `useActionState` updates `state` and `isPending` as part of a transition; if
  you call `formAction` outside one, React will warn and the pending state will
  not behave correctly. (When you use `<form action={formAction}>` directly, React
  wraps it for you — but the moment you go manual, you own the transition.)

### Reacting to the result

A Server Action's return value lands in `state` *after* render, so you must not
read it during render. The project's convention is a `useEffect`:

```tsx
useEffect(() => {
  if (stage !== "parsing" || isPending) return;   // guard against stale runs
  if (!state) return;

  if (state.error) {
    setStage("error");
    toast.error("CV parsing failed", { description: state.error });
    return;
  }
  if (state.cvUploadId) {
    setStage("done");
    toast.success("CV parsed successfully!", { ... });
    router.refresh();                              // re-render server-side → State 2
  }
}, [stage, isPending, state, router]);
```

The `router.refresh()` call is the magic that moves the user from State 1 to
State 2 without a client-side navigation. The page server component re-reads the
DB, sees the new `cvUpload` row, and renders `<OnboardingReview>` instead.

---

## 3. Pattern B — RHF + `useActionState` (the hybrid case)

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/OnboardingReview.tsx" />

`OnboardingReview` (State 2) is a much bigger form: editable work history (an
array of objects), user-collected preferences (country, multi-selects), and 1–3
personas each with a drag-and-drop list of 5 tags. This is exactly the kind of
state RHF was built for, and exactly the kind of submission
`useActionState` was built for. **They coexist in one component.**

### 3.1 Setting up RHF

```tsx
const form = useForm<OnboardingPayloadInput>({
  resolver: zodResolver(onboardingPayloadSchema),   // Zod runs on the client
  defaultValues,                                     // from extractionToFormDefaults()
  mode: "onSubmit",
});
```

Three things to notice:

- **`zodResolver(onboardingPayloadSchema)`** plugs the *same* Zod schema that the
  server uses into RHF. This is what makes "Zod validates at both layers"
  literally true — one schema object, two execution sites.
- **`defaultValues`** is the LLM extraction (Schema 1, snake_case) mapped into
  Schema 2 (camelCase) by `extractionToFormDefaults()`. RHF treats this as the
  starting form state; the user then edits it.
- **`mode: "onSubmit"`** means RHF only validates when the user submits, not on
  every keystroke. This matches the server's "validate once at the boundary"
  philosophy and avoids noisy errors while the user is mid-edit.

### 3.2 Controlled sub-components via `watch` + `setValue`

The form is split into presentational sections (`ApplicantSection`,
`PersonaSection`, `SkillsSection`). RHF stays the **single source of truth** in
the parent; the children are controlled via props:

```tsx
const workHistory = form.watch("workHistory");
const personas = form.watch("personas");
// ...other watched fields

<ApplicantSection
  workHistory={workHistory}
  onWorkHistoryChange={(next) =>
    form.setValue("workHistory", next, { shouldDirty: true })
  }
  errors={form.formState.errors}
/>
```

The pattern is always the same pair:

- **`form.watch("field")`** — read the current value reactively (re-renders on
  change). This is what you pass *down* as props.
- **`form.setValue("field", next, { shouldDirty: true })`** — write a new value
  back into RHF's state. This is what the child's `onChange` callback calls.

This is the key to combining RHF with **custom, non-input UI** like the
`@dnd-kit` drag-and-drop in `PersonaSection`. RHF's `<Controller>` and
`useFormContext`/`register` are great for native inputs, but for a DnD list you
just hand the array down and let the child call `onChange(nextArray)`. RHF does
not care *how* the value changed — only that you told it via `setValue`.

### 3.3 The bridge — where RHF hands off to `useActionState`

This is the heart of the hybrid pattern, and it is small enough to read in one
glance:

```tsx
const [state, formAction, isPending] = useActionState(
  finalizeOnboardingAction,
  null,
);

const onSubmit = form.handleSubmit((data) => {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(data));
  startTransition(() => {
    formAction(formData);
  });
});

return <form onSubmit={onSubmit}> ... </form>;
```

Walk through what happens when the user clicks "Confirm":

1. **`<form onSubmit={onSubmit}>`** fires. `onSubmit` is *not* the native
   behavior — it is `form.handleSubmit(...)`, which RHF provides.
2. **RHF runs the `zodResolver`** against the entire form state. If anything
   fails, RHF populates `form.formState.errors`, the sections render the error
   messages, and the callback **never runs**. The server is never called. This
   is your fast, free, client-side gate.
3. **Only if validation passes**, RHF calls the callback with `data: OnboardingPayloadInput`
   — the fully typed, validated form state.
4. **The callback serializes `data` to JSON and stuffs it into a single FormData
   field named `"payload"`.** This is the bridge. RHF's richly-typed nested
   object becomes one JSON string crossing the client/server boundary.
5. **`startTransition(() => formAction(formData))`** invokes the Server Action.
   `isPending` flips to `true`; React manages the transition.
6. The Server Action runs, returns `FinalizeOnboardingState`, and that value
   lands in `state`.

Note the deliberate asymmetry with Pattern A: in `CvUploadForm` we put three
flat string fields into FormData (`label`, `originalFileName`, `rawText`). In
`OnboardingReview` we put **one** JSON blob (`payload`). The reason is that
FormData handles flat strings natively, but serializing nested arrays-of-objects
through FormData's key/value model is painful and lossy. JSON-in-one-field is
the pragmatic choice for complex payloads — and because the server re-validates
with Zod anyway, the wire format is not a security boundary.

### 3.4 The server side — the `(prevState, formData)` contract

**File:** <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" />

Every Server Action used with `useActionState` has the same signature:

```ts
export async function finalizeOnboardingAction(
  _prevState: FinalizeOnboardingState,   // the previous `state` (usually unused)
  formData: FormData,                     // what the client sent
): Promise<FinalizeOnboardingState> {     // becomes the next `state`
  ...
}
```

- **`_prevState`** is the current value of `state` on the client. The project
  does not use it (note the `_` prefix), but it is there if you ever want
  progressive disclosure (e.g. accumulate errors across attempts).
- **`formData`** is the bridge payload from §3.3.
- **The return type** must match what the client declared in
  `useActionState(finalizeOnboardingAction, null)` — here
  `FinalizeOnboardingState = { error: string | null; success: boolean } | null`.

The body of the action follows a strict, repeatable structure:

```ts
// 1. Auth — always first.
const session = await getAuthSession();
if (!session) return { error: "Not authenticated", success: false };

// 2. Extract from FormData.
const payloadJson = formData.get("payload") as string | null;
if (!payloadJson) return { error: "Missing payload", success: false };

// 3. Parse JSON.
let payload: unknown;
try { payload = JSON.parse(payloadJson); }
catch { return { error: "Invalid JSON payload", success: false }; }

// 4. RE-VALIDATE with the SAME Zod schema the client used. Never trust the client.
const parsed = onboardingPayloadSchema.safeParse(payload);
if (!parsed.success) {
  return { error: parsed.error.issues[0]?.message ?? "Invalid payload", success: false };
}
const data: OnboardingPayload = parsed.data;

// 5. Do the real work (embeddings + DB transaction).
// 6. Return a plain serializable object.
```

**Step 4 is the most important line in the whole architecture.** The client's
Zod validation is a UX feature, not a security feature — a user can bypass it
trivially. The server's `safeParse` is the real gate. Because both sides import
the *same* `onboardingPayloadSchema` from <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/schemas.ts" />,
the two validations can never drift.

### 3.5 Reacting to the server result (again, an effect)

Identical shape to Pattern A:

```tsx
useEffect(() => {
  if (isPending) return;
  if (!state) return;

  if (state.success) {
    toast.success("Onboarding complete!", { ... });
    router.refresh();                 // State 2 → State 3
  } else if (state.error) {
    toast.error("Onboarding failed", { description: state.error });
  }
}, [isPending, state, router]);
```

The `router.refresh()` is what transitions the user from State 2 to State 3
(Profile Management): the page server component re-reads `applicant.isOnBoarded`
(now `true`), and renders the State 3 component instead.

---

## 4. The Two Schemas — Why They Exist

A subtle but crucial point: Module A has **two** Zod schemas, not one. They live
in <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/schemas.ts" />.

| Schema | Shape | Who produces it | Case | Used by |
|---|---|---|---|---|
| **Schema 1** `resumeExtractionSchema` | snake_case (`start_date`, `is_current`, `must_have_tags`) | gpt-4o via `generateObject` | LLM output convention | `parseCvAction`, stored in `cvUpload.extractedJson` |
| **Schema 2** `onboardingPayloadSchema` | camelCase (`startDate`, `isCurrent`, `mustHaveTags`) | the user (after reviewing) | TS/JS convention | RHF `zodResolver`, `finalizeOnboardingAction` |

`extractionToFormDefaults()` in `OnboardingReview` is the **only** place that
translates Schema 1 → Schema 2. After that translation, the form state *is*
Schema 2, and Schema 2 is what gets serialized to `"payload"` and re-validated on
the server. This keeps the LLM's snake_case conventions bottled up on the server
side and lets the rest of the codebase speak idiomatic TypeScript.

Both schemas share the same business rules via `.refine()` — e.g. "each persona
must contain at least 1 `persona_defining` tag" appears in both. That rule is
enforced once at LLM generation time (Schema 1) and again at user submission
time (Schema 2), so a user editing their personas cannot accidentally remove all
defining tags.

---

## 5. The Full Data Flow, End to End

Tracing one complete submit of `OnboardingReview`:

```
[User clicks "Confirm"]
        │
        ▼
<form onSubmit={onSubmit}>              ← onSubmit = form.handleSubmit(callback)
        │
        ▼
RHF runs zodResolver(onboardingPayloadSchema) on form state
        │
        ├─ FAIL → form.formState.errors populated → sections render errors → STOP
        │
        ▼ PASS — callback(data) invoked with typed OnboardingPayloadInput
        │
        ▼
const formData = new FormData()
formData.set("payload", JSON.stringify(data))
        │
        ▼
startTransition(() => formAction(formData))     ← useActionState dispatch
        │
        ├─ isPending = true → button shows spinner, inputs disabled
        │
        ▼
[Network] POST to Server Action endpoint (Next.js machinery, opaque)
        │
        ▼
finalizeOnboardingAction(_prevState, formData)   ← server
        │
        ├─ getAuthSession() → 401 if no session
        ├─ JSON.parse(formData.get("payload"))
        ├─ onboardingPayloadSchema.safeParse()   ← REAL validation
        │     └─ FAIL → return { error, success: false }
        ├─ generateEmbeddings(...)                ← OpenAI call
        └─ db.transaction(...)                   ← applicant + workingHistory
                                                    + tagsExperience + persona
        │
        ▼
return { error: null, success: true }            ← serializable state
        │
        ▼
[Network] response back to client
        │
        ▼
useActionState sets state = { error: null, success: true }, isPending = false
        │
        ▼
useEffect fires (deps: isPending, state, router)
        │
        ├─ toast.success("Onboarding complete!")
        └─ router.refresh()
                │
                ▼
        Page server component re-runs → reads applicant.isOnBoarded === true
                │
                ▼
        Renders <ProfileManagement> (State 3) instead of <OnboardingReview>
```

---

## 6. Why This Design — The Payoffs

Once you see the pipeline, the design choices snap into focus:

1. **RHF is worth its weight on `OnboardingReview`** because of nested arrays
   (work history, personas, must-have tags), drag-and-drop, and per-field error
   display. On `CvUploadForm` it would be pure overhead — so it is not used.
   *Pick the tool for the form's complexity, not by reflex.*

2. **`useActionState` is used in *both* forms** because both forms talk to a
   Server Action. It gives you `isPending` and a typed `state` for free, and it
   is the official React 19 way to drive Server Actions from client components.

3. **One Zod schema, two execution sites** (for Schema 2) gives you fast client
   feedback *and* a real security boundary, with zero duplication. The schema is
   the single source of truth for "what is a valid onboarding payload."

4. **The bridge is intentionally dumb** — `JSON.stringify` into one FormData
   field. No clever field-mapping, no `useFormContext` leaking across the
   network. The complexity lives in RHF (client) and Zod (server), not in the
   wire format.

5. **`router.refresh()` instead of client navigation** keeps the state machine
   (State 1 → 2 → 3) server-driven. The client never decides which presentation
   to show; it just asks the server to re-render the page after a mutation. This
   is the Next.js 16 App Router idiom and it keeps the source of truth in the DB.

6. **`useEffect` for result handling** is a deliberate rule, not a hack. Server
   Action results arrive *after* render, so reading `state` during render would
   be stale. The effect is the correct place for side effects (toasts,
   navigation) that depend on the result.

---

## 7. Common Pitfalls This Architecture Avoids

| Pitfall | How this codebase avoids it |
|---|---|
| Calling `formAction` outside a transition → broken `isPending` | Always wrapped in `startTransition(() => formAction(formData))` when called manually. |
| Trusting client Zod validation as the security gate | Server Action re-runs `safeParse` on every submission. |
| Client/server schema drift | Both sides import the *same* exported schema object. |
| Trying to `register` a drag-and-drop list with RHF | Use `watch` + `setValue` instead — RHF does not care how the value changed. |
| Reading `state` during render to fire toasts | Done in `useEffect` with proper guards (`isPending`, `null` checks). |
| Returning non-serializable values (Date, Map, class instances) from a Server Action | Actions return plain `{ error, success }` / `{ error, cvUploadId, extraction }` objects. |
| Letting LLM snake_case leak into the form/DB layer | `extractionToFormDefaults()` is the one translation point; everything downstream is camelCase Schema 2. |

---

## 8. When to Use Which Pattern

Use **Pattern A (`useActionState` alone)** when:
- The form has a handful of flat string/number/file fields.
- There is no nested array state or custom UI like DnD.
- You want the absolute minimum of moving parts.
- Example in this project: `CvUploadForm`, `SignInForm`, `SignUpForm`,
  `ResetPasswordForm`.

Use **Pattern B (RHF + `useActionState`)** when:
- The form has nested objects, arrays of objects, or dynamic field counts.
- You need field-level error display tied to specific inputs.
- You have custom interaction UI (drag-and-drop, multi-select chips, etc.) that
  does not map cleanly to native inputs.
- You want client-side validation to gate the server call for UX (not security).
- Example in this project: `OnboardingReview`.

A good rule of thumb: **if you would reach for `setValue` or `useFieldArray`,
reach for RHF. If you would reach for `formData.set("x", value)`, reach for
`useActionState` alone.** And in Pattern B, never forget the bridge — RHF
validates, you serialize, `useActionState` dispatches.

---

## 9. File Reference Index

| File | Role |
|---|---|
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/CvUploadForm.tsx" /> | Pattern A — `useActionState` alone + Web Worker two-stage submit |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/OnboardingReview.tsx" /> | Pattern B — RHF + `useActionState` hybrid (the canonical example) |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/ApplicantSection.tsx" /> | Controlled child using `watch`/`setValue` props from the parent |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/onboarding/PersonaSection.tsx" /> | Controlled child with DnD — same `watch`/`setValue` contract |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/actions/onboarding.ts" /> | Both Server Actions: `parseCvAction`, `finalizeOnboardingAction` |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/lib/onboarding/schemas.ts" /> | Schema 1 (LLM) + Schema 2 (form/server), shared by both layers |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/src/components/auth/SignInForm.tsx" /> | Another Pattern A example, for contrast (auth forms) |
| <ref_file file="/Users/knez/Documents/WebDev/vectormatch/docs/MODULE_A_DECISIONS.md" /> | §7 is the governing decision this guide explains |

---

## 10. One-Paragraph Summary

React Hook Form and `useActionState` are not alternatives — they are two halves
of one pipeline. RHF owns the client: field state, the `zodResolver` gate, and
controlled sub-components via `watch`/`setValue`. `useActionState` owns the
crossing: it wraps a Server Action, gives you `isPending` and a typed `state`,
and is dispatched inside `startTransition`. The bridge between them is three
lines of code — `JSON.stringify(data)` into a single `FormData` field, then
`formAction(formData)`. On the server, the action re-validates with the *same*
Zod schema (never trust the client), does the work, and returns a plain
serializable object that a `useEffect` on the client turns into toasts and a
`router.refresh()`. Pick Pattern A for flat forms, Pattern B for anything with
nested or custom-interaction state.
