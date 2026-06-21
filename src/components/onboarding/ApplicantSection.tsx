"use client";

// ApplicantSection — editable work history + user-collected onboarding fields
// src/components/onboarding/ApplicantSection.tsx
//
// Two sub-sections:
//
//   1. Work history (from the LLM extraction, user-editable):
//      - Each row: company, role (free text + CANONICAL_ROLES dropdown hint),
//        start date (YYYY-MM), end date (YYYY-MM or empty if current),
//        isCurrent checkbox, detected skills (read-only badges).
//
//   2. User-collected fields (never from the LLM — MODULE_A_DECISIONS.md §9):
//      - country (ISO 3166-1 alpha-2)
//      - canWorkUsHours (boolean)
//      - assignmentTypes (multi-select from enum)
//      - modalities (multi-select from enum)
//      - preferredCompliance (multi-select from enum)
//
// The parent (OnboardingReview) owns the state and passes it down with onChange
// callbacks. This keeps the RHF form state as the single source of truth.

import type { FieldErrors } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CANONICAL_TAG_MAP } from "@/lib/jobs/tech-tags";
import type {
  AssignmentType,
  Modality,
  OnboardingPayloadInput,
  PreferredCompliance,
  Schema2WorkHistoryEntry,
} from "@/lib/onboarding/schemas";
import {
  assignmentTypesEnum,
  modalitiesEnum,
  preferredComplianceEnum,
} from "@/lib/onboarding/schemas";

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

type ApplicantSectionProps = {
  workHistory: Schema2WorkHistoryEntry[];
  onWorkHistoryChange: (next: Schema2WorkHistoryEntry[]) => void;
  country: string;
  onCountryChange: (next: string) => void;
  canWorkUsHours: boolean;
  onCanWorkUsHoursChange: (next: boolean) => void;
  assignmentTypes: AssignmentType[];
  onAssignmentTypesChange: (next: AssignmentType[]) => void;
  modalities: Modality[];
  onModalitiesChange: (next: Modality[]) => void;
  preferredCompliance: PreferredCompliance[];
  onPreferredComplianceChange: (next: PreferredCompliance[]) => void;
  errors?: FieldErrors<OnboardingPayloadInput>;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-0.5">{message}</p>;
}

export function ApplicantSection({
  workHistory,
  onWorkHistoryChange,
  country,
  onCountryChange,
  canWorkUsHours,
  onCanWorkUsHoursChange,
  assignmentTypes,
  onAssignmentTypesChange,
  modalities,
  onModalitiesChange,
  preferredCompliance,
  onPreferredComplianceChange,
  errors,
}: ApplicantSectionProps) {
  const updateEntry = (
    index: number,
    patch: Partial<Schema2WorkHistoryEntry>,
  ) => {
    onWorkHistoryChange(
      workHistory.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const toggleArrayValue = <T extends string>(
    values: T[],
    value: T,
    setter: (next: T[]) => void,
  ) => {
    setter(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  };

  return (
    <section className="flex flex-col gap-6">
      {/* Work history */}
      <Card>
        <CardHeader>
          <CardTitle>Work history</CardTitle>
          <CardDescription>
            Extracted from your CV. Edit any field to correct the AI before
            confirming.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {workHistory.map((entry, index) => (
            <div
              key={`${entry.company}-${entry.role}-${entry.startDate}-${index}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`company-${index}`}>Company</Label>
                  <Input
                    id={`company-${index}`}
                    type="text"
                    value={entry.company}
                    onChange={(e) =>
                      updateEntry(index, { company: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`role-${index}`}>Role</Label>
                  <Input
                    id={`role-${index}`}
                    type="text"
                    list="canonical-roles"
                    value={entry.role}
                    onChange={(e) =>
                      updateEntry(index, { role: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`start-${index}`}>Start date (YYYY-MM)</Label>
                  <Input
                    id={`start-${index}`}
                    type="text"
                    placeholder="2020-01"
                    value={entry.startDate}
                    onChange={(e) =>
                      updateEntry(index, { startDate: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`end-${index}`}>
                    End date (YYYY-MM, leave empty if current)
                  </Label>
                  <Input
                    id={`end-${index}`}
                    type="text"
                    placeholder="2024-06"
                    value={entry.endDate ?? ""}
                    disabled={entry.isCurrent}
                    onChange={(e) =>
                      updateEntry(index, {
                        endDate: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`current-${index}`}
                  checked={entry.isCurrent}
                  onCheckedChange={(checked) =>
                    updateEntry(index, {
                      isCurrent: checked === true,
                      endDate: checked === true ? null : entry.endDate,
                    })
                  }
                />
                <Label
                  htmlFor={`current-${index}`}
                  className="text-sm font-normal"
                >
                  I currently work here
                </Label>
              </div>

              {entry.canonicalSkillsDetected.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Detected skills
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.canonicalSkillsDetected.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {CANONICAL_TAG_MAP.get(tag)?.label ?? tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* User-collected fields */}
      <Card>
        <CardHeader>
          <CardTitle>Work preferences</CardTitle>
          <CardDescription>
            These details are not extracted from your CV — we need them to route
            the right jobs to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Work preferences
            </h2>
            <p className="text-sm text-muted-foreground">
              These details are not extracted from your CV — we need them to
              route the right jobs to you.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="country">Country (ISO 3166-1 alpha-2)</Label>
              <Input
                id="country"
                type="text"
                maxLength={2}
                placeholder="e.g. RS, US, DE"
                value={country}
                onChange={(e) => onCountryChange(e.target.value.toUpperCase())}
              />
              <FieldError message={errors?.country?.message} />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="can-work-us-hours"
                checked={canWorkUsHours}
                onCheckedChange={(checked) =>
                  onCanWorkUsHoursChange(checked === true)
                }
              />
              <Label
                htmlFor="can-work-us-hours"
                className="text-sm font-normal"
              >
                I can work US business hours
              </Label>
            </div>
          </div>

          <MultiCheckboxField
            label="Assignment types"
            options={assignmentTypesEnum.options}
            labels={ASSIGNMENT_TYPE_LABELS}
            values={assignmentTypes}
            onToggle={(value) =>
              toggleArrayValue(assignmentTypes, value, onAssignmentTypesChange)
            }
            errorMessage={errors?.assignmentTypes?.message}
          />

          <MultiCheckboxField
            label="Modalities"
            options={modalitiesEnum.options}
            labels={MODALITY_LABELS}
            values={modalities}
            onToggle={(value) =>
              toggleArrayValue(modalities, value, onModalitiesChange)
            }
            errorMessage={errors?.modalities?.message}
          />

          <MultiCheckboxField
            label="Preferred compliance"
            options={preferredComplianceEnum.options}
            labels={COMPLIANCE_LABELS}
            values={preferredCompliance}
            onToggle={(value) =>
              toggleArrayValue(
                preferredCompliance,
                value,
                onPreferredComplianceChange,
              )
            }
          />
        </CardContent>
      </Card>
    </section>
  );
}

type MultiCheckboxFieldProps<T extends string> = {
  label: string;
  options: readonly T[];
  labels: Record<string, string>;
  values: T[];
  onToggle: (value: T) => void;
  errorMessage?: string;
};

function MultiCheckboxField<T extends string>({
  label,
  options,
  labels,
  values,
  onToggle,
  errorMessage,
}: MultiCheckboxFieldProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={`opt-${option}`}
              checked={values.includes(option)}
              onCheckedChange={() => onToggle(option)}
            />
            <Label
              htmlFor={`opt-${option}`}
              className="text-sm font-normal cursor-pointer"
            >
              {labels[option] ?? option}
            </Label>
          </div>
        ))}
      </div>
      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

export type { ApplicantSectionProps };
