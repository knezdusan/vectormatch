"use client";

// OnboardingReview — State 2 presentation
// src/components/onboarding/OnboardingReview.tsx
//
// Shown when a valid cvUpload row exists but the user is not yet onboarded.
// Renders the LLM extraction for user review/confirmation plus the
// user-collected fields (country, work preferences) and persona confirmation.
//
// Architecture (MODULE_A_DECISIONS.md §7 — RHF + Server Actions compose):
//   - React Hook Form manages client-side form state (field values, validation,
//     drag-and-drop). The zodResolver runs onboardingPayloadSchema on the client.
//   - useActionState wraps finalizeOnboardingAction for the server submission.
//   - On submit, RHF's handleSubmit validates, then we serialize the form data
//     to JSON, put it in a hidden FormData field ("payload"), and call the
//     server action via formAction. The server re-validates with the same Zod
//     schema (never trust the client).
//
// Schema 1 (LLM output, snake_case) is mapped to Schema 2 (form state,
// camelCase) for the form defaults. On submit, the form state IS Schema 2, so
// we serialize it directly.

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { finalizeOnboardingAction } from "@/actions/onboarding";
import { ApplicantSection } from "@/components/onboarding/ApplicantSection";
import { PersonaSection } from "@/components/onboarding/PersonaSection";
import { SkillsSection } from "@/components/onboarding/SkillsSection";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Applicant } from "@/db/schemas/jobs/applicant";
import type { CvUpload } from "@/db/schemas/jobs/cvUpload";
import {
  type OnboardingPayloadInput,
  onboardingPayloadSchema,
  type ResumeExtractionOutput,
  type Schema2Persona,
} from "@/lib/onboarding/schemas";

/**
 * Map a Schema 1 LLM extraction (snake_case) to Schema 2 form defaults
 * (camelCase). This is the initial state of the RHF form.
 */
function extractionToFormDefaults(
  extraction: ResumeExtractionOutput,
  cvUploadId: string,
): OnboardingPayloadInput {
  return {
    country: "",
    canWorkUsHours: false,
    assignmentTypes: [],
    modalities: [],
    preferredCompliance: [],
    seniorityLevels: extraction.inferred_seniority
      ? [extraction.inferred_seniority]
      : ["senior"],
    cvUploadId,
    workHistory: extraction.roles.map((role) => ({
      company: role.company,
      role: role.title,
      startDate: role.start_date,
      endDate: role.end_date,
      isCurrent: role.is_current,
      summary: role.summary,
      canonicalSkillsDetected: role.canonical_skills_detected,
      rawSkillsDetected: role.raw_skills_detected,
    })),
    personas: extraction.proposed_stacks.map((stack) => ({
      personaId: stack.persona_id,
      personaLabel: stack.persona_label,
      embeddingSummary: stack.embedding_summary,
      mustHaveTags: stack.must_have_tags,
      blocklistTags: [],
      // Initialize each persona's seniority from the LLM-inferred level.
      // The user can adjust per-persona in the PersonaSection UI.
      seniorityLevels: extraction.inferred_seniority
        ? [extraction.inferred_seniority]
        : [],
    })),
  };
}

type OnboardingReviewProps = {
  cvUpload: CvUpload;
  applicant: Applicant | null;
};

export function OnboardingReview({
  cvUpload,
  applicant: _applicant,
}: OnboardingReviewProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    finalizeOnboardingAction,
    null,
  );

  // The extraction payload is stored as JSONB; cast through unknown to the
  // typed Schema 1 output. The page only renders this component when
  // status === "valid" && extractedJson is non-null, so this is safe.
  const extraction =
    cvUpload.extractedJson as unknown as ResumeExtractionOutput;

  const defaultValues = useMemo(
    () => extractionToFormDefaults(extraction, cvUpload.id),
    [extraction, cvUpload.id],
  );

  const form = useForm<OnboardingPayloadInput>({
    resolver: zodResolver(onboardingPayloadSchema),
    defaultValues,
    mode: "onSubmit",
  });

  // Watched values for the sub-sections (controlled inputs).
  const workHistory = form.watch("workHistory");
  const country = form.watch("country");
  const canWorkUsHours = form.watch("canWorkUsHours");
  const assignmentTypes = form.watch("assignmentTypes");
  const modalities = form.watch("modalities");
  const preferredCompliance = form.watch("preferredCompliance");
  const seniorityLevels = form.watch("seniorityLevels");
  const personas = form.watch("personas");

  // The full pool of canonical skills detected across all roles — used by
  // SkillsSection (display) and PersonaSection (drag-and-drop source).
  const allCanonicalSkills = useMemo(() => {
    const set = new Set<string>();
    for (const entry of workHistory) {
      for (const tag of entry.canonicalSkillsDetected) {
        set.add(tag);
      }
    }
    return Array.from(set);
  }, [workHistory]);

  const onSubmit = form.handleSubmit((data) => {
    // Serialize the validated form data to JSON and call the server action
    // directly via startTransition (required by useActionState).
    const formData = new FormData();
    formData.set("payload", JSON.stringify(data));
    startTransition(() => {
      formAction(formData);
    });
  });

  // React to the server action result in an effect (not during render).
  useEffect(() => {
    if (isPending) return;
    if (!state) return;

    if (state.success) {
      toast.success("Onboarding complete!", {
        description: "Your profile is set up and ready for job matching.",
      });
      // Re-render the page server-side → State 3 (ProfileManagement).
      router.refresh();
    } else if (state.error) {
      toast.error("Onboarding failed", {
        description: state.error,
      });
    }
  }, [isPending, state, router]);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Review your profile
        </CardTitle>
        <CardDescription>
          We extracted your work history and skills from your CV with AI. Please
          review and correct anything, fill in your work preferences, then
          confirm your personas to complete onboarding.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-8">
          <ApplicantSection
            workHistory={workHistory}
            onWorkHistoryChange={(next) =>
              form.setValue("workHistory", next, { shouldDirty: true })
            }
            country={country}
            onCountryChange={(next) =>
              form.setValue("country", next, { shouldDirty: true })
            }
            canWorkUsHours={canWorkUsHours}
            onCanWorkUsHoursChange={(next) =>
              form.setValue("canWorkUsHours", next, { shouldDirty: true })
            }
            assignmentTypes={assignmentTypes}
            onAssignmentTypesChange={(next) =>
              form.setValue("assignmentTypes", next, { shouldDirty: true })
            }
            modalities={modalities}
            onModalitiesChange={(next) =>
              form.setValue("modalities", next, { shouldDirty: true })
            }
            preferredCompliance={preferredCompliance}
            onPreferredComplianceChange={(next) =>
              form.setValue("preferredCompliance", next, { shouldDirty: true })
            }
            seniorityLevels={seniorityLevels}
            onSeniorityLevelsChange={(next) =>
              form.setValue("seniorityLevels", next, { shouldDirty: true })
            }
            errors={form.formState.errors}
          />

          <SkillsSection canonicalSkills={allCanonicalSkills} />

          <PersonaSection
            personas={personas as Schema2Persona[]}
            availableSkills={allCanonicalSkills}
            onChange={(next) =>
              form.setValue("personas", next, { shouldDirty: true })
            }
            errors={
              form.formState.errors.personas as unknown as {
                personaLabel?: { message?: string };
                embeddingSummary?: { message?: string };
                mustHaveTags?: { message?: string } | { message?: string }[];
              }[]
            }
          />

          {/* Client-side validation errors from RHF — summary of error fields */}
          {Object.keys(form.formState.errors).length > 0 && (
            <div
              className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
              role="alert"
            >
              <p className="font-medium mb-1">
                Please fix the following before submitting:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {form.formState.errors.country && (
                  <li>Country is required (2-letter code, e.g. RS, US, DE)</li>
                )}
                {form.formState.errors.assignmentTypes && (
                  <li>Select at least one assignment type</li>
                )}
                {form.formState.errors.modalities && (
                  <li>Select at least one modality</li>
                )}
                {form.formState.errors.preferredCompliance && (
                  <li>Select at least one preferred compliance option</li>
                )}
                {form.formState.errors.workHistory && (
                  <li>Work history has errors — check dates and fields</li>
                )}
                {form.formState.errors.personas && (
                  <li>
                    Personas have errors — each needs a label, 50-500 char
                    summary, and exactly 5 must-have tags (at least 1
                    persona-defining)
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Server-side errors from useActionState */}
          {state?.error && (
            <div
              className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </div>
          )}

          {state?.success && (
            <output className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              Onboarding complete. Loading your profile…
            </output>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner className="mr-2" /> Completing onboarding…
              </>
            ) : (
              "Confirm and complete onboarding"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
