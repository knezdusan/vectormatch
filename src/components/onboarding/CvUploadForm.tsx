"use client";

// CvUploadForm — State 1 presentation
// src/components/onboarding/CvUploadForm.tsx
//
// Shown when the user has no valid cvUpload row. The flow is a two-stage
// client→server pipeline:
//
//   1. User selects a PDF and enters a mandatory CV label.
//   2. On submit, we run extractPdfText(file) in a Web Worker to get raw text.
//   3. We populate hidden form fields (rawText, originalFileName, label) and
//      trigger the parseCvAction Server Action via useActionState's formAction.
//   4. parseCvAction runs gpt-4o extraction and persists cvUpload.extractedJson.
//   5. On success, router.refresh() re-renders the page server-side as State 2.
//
// Architecture note: the form uses a native <form action={formAction}> so the
// Server Action receives a FormData object with the hidden fields. The visible
// submit triggers a two-phase flow: first the Web Worker (client-side), then a
// programmatic form submission that bypasses the worker via a ref flag.

import { FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { parseCvAction } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { extractPdfText } from "@/lib/onboarding/pdf-worker-client";

type Stage = "idle" | "extracting" | "parsing" | "done" | "error";

export function CvUploadForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(parseCvAction, null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [clientError, setClientError] = useState<string | null>(null);

  const canSubmit =
    file !== null && label.trim().length > 0 && stage === "idle";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setClientError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent the native form action — we handle submission manually after the
    // worker finishes, by calling parseCvAction directly with a FormData.
    event.preventDefault();
    if (!file || !label.trim()) return;

    setClientError(null);
    setStage("extracting");

    let rawText: string;
    try {
      const result = await extractPdfText(file);
      rawText = result.rawText;
    } catch (error) {
      setStage("error");
      setClientError(
        error instanceof Error
          ? error.message
          : "Failed to extract text from PDF",
      );
      return;
    }

    // Build a FormData with the extracted text and call the server action
    // directly. This avoids the requestSubmit() + hidden field timing issues.
    const formData = new FormData();
    formData.set("label", label.trim());
    formData.set("originalFileName", file.name);
    formData.set("rawText", rawText);

    setStage("parsing");
    // Call the server action via startTransition so React updates isPending
    // and state correctly (useActionState requires a transition context).
    startTransition(() => {
      formAction(formData);
    });
  };

  // React to the Server Action result. useActionState updates `state` after the
  // action resolves; we watch it in an effect to avoid side effects during render.
  useEffect(() => {
    if (stage !== "parsing" || isPending) return;
    if (!state) return;

    if (state.error) {
      setStage("error");
      toast.error("CV parsing failed", { description: state.error });
      return;
    }
    if (state.cvUploadId) {
      setStage("done");
      toast.success("CV parsed successfully!", {
        description: "Review your extracted profile to continue.",
      });
      // Re-render the page server-side → State 2 (OnboardingReview).
      router.refresh();
    }
  }, [stage, isPending, state, router]);

  const isBusy = stage === "extracting" || stage === "parsing" || isPending;
  const displayError = clientError ?? state?.error ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload your CV
        </h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll extract your work history and skills with AI, then you
          confirm the details before completing your profile.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-label">CV name</Label>
          <Input
            id="cv-label"
            name="label"
            type="text"
            placeholder="e.g. Senior React CV 2024"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            disabled={isBusy}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            A mandatory name for this CV — you can upload multiple CVs later.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-file">CV file (PDF)</Label>
          <label
            htmlFor="cv-file"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <FileText className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {file ? file.name : "Click to select a PDF file"}
            </span>
            <span className="text-xs text-muted-foreground">
              PDF only, max ~10MB
            </span>
          </label>
          <Input
            id="cv-file"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={isBusy}
            required
          />
        </div>

        {displayError && (
          <div
            className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
            role="alert"
          >
            {displayError}
          </div>
        )}

        {stage === "done" && (
          <output className="rounded-md bg-primary/10 p-3 text-sm text-primary">
            CV parsed successfully. Loading your profile review…
          </output>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={!canSubmit || isBusy}
        >
          {stage === "extracting" ? (
            <>
              <Spinner className="mr-2" /> Extracting text…
            </>
          ) : stage === "parsing" || isPending ? (
            <>
              <Spinner className="mr-2" /> AI parsing CV…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" /> Upload and parse CV
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
