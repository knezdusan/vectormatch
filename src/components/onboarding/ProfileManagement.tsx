"use client";

// ProfileManagement — State 3 presentation (editable post-onboarding)
// src/components/onboarding/ProfileManagement.tsx
//
// Shown when applicant.isOnboarded is true. Provides read-only views plus
// editable forms for each profile section. Each section has its own edit mode
// so users can update one part at a time.

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { toast } from "sonner";
import { reparseCvAction } from "@/actions/profile";
import { ProfilePersonasForm } from "@/components/onboarding/ProfilePersonasForm";
import { ProfilePreferencesForm } from "@/components/onboarding/ProfilePreferencesForm";
import { ProfileWorkHistoryForm } from "@/components/onboarding/ProfileWorkHistoryForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Applicant } from "@/db/schemas/jobs/applicant";
import type { CvUpload } from "@/db/schemas/jobs/cvUpload";
import type { Persona } from "@/db/schemas/jobs/persona";
import type { TagsExperience } from "@/db/schemas/jobs/tagsExperience";
import type { WorkingHistory } from "@/db/schemas/jobs/workingHistory";
import { CANONICAL_TAG_MAP } from "@/lib/jobs/tech-tags";

const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  "on-site": "On-site",
  remote_local: "Remote (local timezone)",
};

const MODALITY_LABELS: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
};

const COMPLIANCE_LABELS: Record<string, string> = {
  w2: "W-2 (US employee)",
  local_employment: "Local employment",
  eor: "Employer of Record (EOR)",
  b2b: "B2B (company-to-company)",
  "1099": "1099 (US contractor)",
  w8ben: "W-8BEN (foreign contractor for US)",
  ic_global: "International contractor (non-US)",
};

type ProfileManagementProps = {
  applicant: Applicant;
  personas: Persona[];
  workHistory: WorkingHistory[];
  tagsExperience: TagsExperience[];
  latestCvUpload: CvUpload | null;
};

export function ProfileManagement({
  applicant,
  personas,
  workHistory,
  tagsExperience,
  latestCvUpload,
}: ProfileManagementProps) {
  const router = useRouter();
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [isEditingWorkHistory, setIsEditingWorkHistory] = useState(false);
  const [isEditingPersonas, setIsEditingPersonas] = useState(false);
  const [isReparsing, setIsReparsing] = useState(false);

  const activeSkills = tagsExperience
    .filter((t) => t.active)
    .map((t) => t.canonicalTag);

  const handleReparseCv = () => {
    if (!latestCvUpload) return;
    setIsReparsing(true);
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ cvUploadId: latestCvUpload.id }));
    startTransition(async () => {
      const result = await reparseCvAction(null, formData);
      setIsReparsing(false);
      if (result?.success) {
        toast.success("CV re-parsed");
        router.refresh();
      } else if (result?.error) {
        toast.error("Failed to re-parse CV", { description: result.error });
      }
    });
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return "Present";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  };

  return (
    <div className="flex flex-col gap-8 p-6 max-w-4xl mx-auto w-full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Update your work preferences, experience, skills, and personas.
        </p>
      </header>

      {/* Work preferences */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Work preferences
          </h2>
          {!isEditingPreferences && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingPreferences(true)}
            >
              Edit
            </Button>
          )}
        </div>
        {isEditingPreferences ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <ProfilePreferencesForm
              applicant={applicant}
              onSaved={() => {
                setIsEditingPreferences(false);
                router.refresh();
              }}
              onCancel={() => setIsEditingPreferences(false)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4">
            <Field
              label="Country"
              value={applicant.country ?? "—"}
              testId="profile-country"
            />
            <Field
              label="Can work US hours"
              value={applicant.canWorkUsHours ? "Yes" : "No"}
              testId="profile-us-hours"
            />
            <FieldArray
              label="Assignment types"
              testId="profile-assignment-types"
              values={(applicant.assignmentTypes ?? []).map(
                (t) => ASSIGNMENT_TYPE_LABELS[t] ?? t,
              )}
            />
            <FieldArray
              label="Modalities"
              testId="profile-modalities"
              values={(applicant.modalities ?? []).map(
                (m) => MODALITY_LABELS[m] ?? m,
              )}
            />
            <FieldArray
              label="Preferred compliance"
              testId="profile-preferred-compliance"
              values={(applicant.preferredCompliance ?? []).map(
                (c) => COMPLIANCE_LABELS[c] ?? c,
              )}
            />
          </div>
        )}
      </section>

      <Separator />

      {/* Work history */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Work history</h2>
          <div className="flex items-center gap-2">
            {latestCvUpload && !isEditingWorkHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isReparsing}
                onClick={handleReparseCv}
              >
                {isReparsing ? "Re-parsing…" : "Re-parse CV"}
              </Button>
            )}
            {!isEditingWorkHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditingWorkHistory(true)}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
        {isEditingWorkHistory ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <ProfileWorkHistoryForm
              workHistory={workHistory}
              onSaved={() => {
                setIsEditingWorkHistory(false);
                router.refresh();
              }}
              onCancel={() => setIsEditingWorkHistory(false)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {workHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No work history entries.
              </p>
            ) : (
              workHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-medium">{entry.role}</h3>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(entry.startDate)} —{" "}
                      {formatDate(entry.endDate)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {entry.company}
                  </p>
                  {entry.canonicalSkillsDetected.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {entry.canonicalSkillsDetected.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {CANONICAL_TAG_MAP.get(tag)?.label ?? tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <Separator />

      {/* Skills & experience */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Skills &amp; experience
        </h2>
        <p className="text-sm text-muted-foreground">
          Derived from your work history. Edit a job entry to change which
          skills are counted.
        </p>
        <div className="flex flex-wrap gap-2">
          {tagsExperience.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills recorded.</p>
          ) : (
            tagsExperience.map((tag) => {
              const label =
                CANONICAL_TAG_MAP.get(tag.canonicalTag)?.label ??
                tag.canonicalTag;
              return (
                <Badge
                  key={tag.id}
                  variant={tag.active ? "default" : "outline"}
                >
                  {label} · {tag.yearsOfExperience}y
                </Badge>
              );
            })
          )}
        </div>
      </section>

      <Separator />

      {/* Personas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Personas</h2>
          {!isEditingPersonas && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingPersonas(true)}
            >
              Edit
            </Button>
          )}
        </div>
        {isEditingPersonas ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <ProfilePersonasForm
              personas={personas}
              availableSkills={activeSkills}
              onSaved={() => {
                setIsEditingPersonas(false);
                router.refresh();
              }}
              onCancel={() => setIsEditingPersonas(false)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No personas defined.
              </p>
            ) : (
              personas.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <h3 className="text-base font-medium">{p.personaLabel}</h3>
                  <p className="text-sm text-muted-foreground">
                    {p.embeddingSummary}
                  </p>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      Must-have tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.mustHaveTags.map((tag) => (
                        <Badge key={tag}>
                          {CANONICAL_TAG_MAP.get(tag)?.label ?? tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {p.blocklistTags.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        Blocklist tags
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.blocklistTags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {CANONICAL_TAG_MAP.get(tag)?.label ?? tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function FieldArray({
  label,
  values,
  testId,
}: {
  label: string;
  values: string[];
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">
        {values.length > 0 ? values.join(", ") : "—"}
      </span>
    </div>
  );
}

export type { ProfileManagementProps };
