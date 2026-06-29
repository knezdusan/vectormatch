"use client";

// ProfilePreferencesForm — editable work preferences for State 3
// src/components/onboarding/ProfilePreferencesForm.tsx

import { startTransition, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateApplicantPreferencesAction } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { Applicant } from "@/db/schemas/jobs/applicant";
import type {
  AssignmentType,
  Modality,
  PreferredCompliance,
  SeniorityLevel,
} from "@/lib/onboarding/schemas";

const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  "on-site": "On-site",
  remote_local: "Remote (local timezone)",
};

const ASSIGNMENT_TYPE_VALUES: AssignmentType[] = [
  "remote",
  "hybrid",
  "on-site",
  "remote_local",
];

const MODALITY_LABELS: Record<Modality, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
};

const MODALITY_VALUES: Modality[] = [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
];

const COMPLIANCE_LABELS: Record<PreferredCompliance, string> = {
  w2: "W-2 (US employee)",
  local_employment: "Local employment",
  eor: "Employer of Record (EOR)",
  b2b: "B2B (company-to-company)",
  "1099": "1099 (US contractor)",
  w8ben: "W-8BEN (foreign contractor for US)",
  ic_global: "International contractor (non-US)",
};

const COMPLIANCE_VALUES: PreferredCompliance[] = [
  "w2",
  "local_employment",
  "eor",
  "b2b",
  "1099",
  "w8ben",
  "ic_global",
];

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  junior: "Junior (0-2 years)",
  mid: "Mid-level (2-5 years)",
  senior: "Senior (5-8 years)",
  lead: "Lead (8-12 years)",
  staff: "Staff (12+ years)",
  principal: "Principal (15+ years)",
};

const SENIORITY_VALUES: SeniorityLevel[] = [
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
];

type ProfilePreferencesFormProps = {
  applicant: Applicant;
  onSaved?: () => void;
  onCancel?: () => void;
};

export function ProfilePreferencesForm({
  applicant,
  onSaved,
  onCancel,
}: ProfilePreferencesFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateApplicantPreferencesAction,
    null,
  );

  const [country, setCountry] = useState(applicant.country ?? "");
  const [canWorkUsHours, setCanWorkUsHours] = useState(
    applicant.canWorkUsHours ?? false,
  );
  const [assignmentTypes, setAssignmentTypes] = useState<AssignmentType[]>(
    (applicant.assignmentTypes ?? []) as AssignmentType[],
  );
  const [modalities, setModalities] = useState<Modality[]>(
    (applicant.modalities ?? []) as Modality[],
  );
  const [preferredCompliance, setPreferredCompliance] = useState<
    PreferredCompliance[]
  >((applicant.preferredCompliance ?? []) as PreferredCompliance[]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>(
    (applicant.seniorityLevels ?? []) as SeniorityLevel[],
  );

  const reset = () => {
    setCountry(applicant.country ?? "");
    setCanWorkUsHours(applicant.canWorkUsHours ?? false);
    setAssignmentTypes((applicant.assignmentTypes ?? []) as AssignmentType[]);
    setModalities((applicant.modalities ?? []) as Modality[]);
    setPreferredCompliance(
      (applicant.preferredCompliance ?? []) as PreferredCompliance[],
    );
    setSeniorityLevels((applicant.seniorityLevels ?? []) as SeniorityLevel[]);
  };

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success("Preferences saved");
      onSaved?.();
    } else if (state.error) {
      toast.error("Failed to save preferences", { description: state.error });
    }
  }, [state, onSaved]);

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        country,
        canWorkUsHours,
        assignmentTypes,
        modalities,
        preferredCompliance,
        seniorityLevels,
      }),
    );
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-country">Country (ISO 3166-1 alpha-2)</Label>
          <Input
            id="profile-country"
            type="text"
            maxLength={2}
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="profile-us-hours"
            checked={canWorkUsHours}
            onCheckedChange={(checked) => setCanWorkUsHours(checked === true)}
          />
          <Label htmlFor="profile-us-hours" className="font-normal">
            Can work US hours
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Assignment types</Label>
        <div className="flex flex-wrap gap-4">
          {ASSIGNMENT_TYPE_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`profile-assignment-${value}`}
                checked={assignmentTypes.includes(value)}
                onCheckedChange={(_checked) =>
                  toggleArrayValue(assignmentTypes, value, setAssignmentTypes)
                }
              />
              <Label
                htmlFor={`profile-assignment-${value}`}
                className="font-normal"
              >
                {ASSIGNMENT_TYPE_LABELS[value]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Modalities</Label>
        <div className="flex flex-wrap gap-4">
          {MODALITY_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`profile-modality-${value}`}
                checked={modalities.includes(value)}
                onCheckedChange={(_checked) =>
                  toggleArrayValue(modalities, value, setModalities)
                }
              />
              <Label
                htmlFor={`profile-modality-${value}`}
                className="font-normal"
              >
                {MODALITY_LABELS[value]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Preferred compliance</Label>
        <div className="flex flex-wrap gap-4">
          {COMPLIANCE_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`profile-compliance-${value}`}
                checked={preferredCompliance.includes(value)}
                onCheckedChange={(_checked) =>
                  toggleArrayValue(
                    preferredCompliance,
                    value,
                    setPreferredCompliance,
                  )
                }
              />
              <Label
                htmlFor={`profile-compliance-${value}`}
                className="font-normal"
              >
                {COMPLIANCE_LABELS[value]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Seniority levels</Label>
        <div className="flex flex-wrap gap-4">
          {SENIORITY_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`profile-seniority-${value}`}
                checked={seniorityLevels.includes(value)}
                onCheckedChange={(_checked) =>
                  toggleArrayValue(seniorityLevels, value, setSeniorityLevels)
                }
              />
              <Label
                htmlFor={`profile-seniority-${value}`}
                className="font-normal"
              >
                {SENIORITY_LABELS[value]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          Save preferences
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            reset();
            onCancel?.();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
