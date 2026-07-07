"use client";

// ProfilePreferencesForm — editable work preferences for State 3
// src/components/onboarding/ProfilePreferencesForm.tsx

import { startTransition, useActionState, useState } from "react";
import { updateApplicantPreferencesAction } from "@/actions/profile";
import { ProfileFormFooter } from "@/components/onboarding/ProfileFormFooter";
import { useActionToast } from "@/components/onboarding/useActionToast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { Applicant } from "@/db/schemas/jobs/applicant";
import type {
  AssignmentType,
  Modality,
  PreferredCompliance,
  SeniorityLevel,
  WorkAuthorization,
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

const WORK_AUTH_LABELS: Record<WorkAuthorization, string> = {
  eu_citizen: "EU/EEA citizen",
  rwr_card_plus: "Austria RWR Card Plus",
  blue_card_eu: "EU Blue Card",
  uk_settled: "UK settled status",
  uk_pre_settled: "UK pre-settled status",
  us_green_card: "US permanent resident (green card)",
  us_citizen: "US citizen",
  canadian_pr: "Canadian permanent resident",
  swiss_permit_c: "Switzerland permit C (settled)",
  other_permit: "Other work permit",
};

const WORK_AUTH_VALUES: WorkAuthorization[] = [
  "eu_citizen",
  "rwr_card_plus",
  "blue_card_eu",
  "uk_settled",
  "uk_pre_settled",
  "us_green_card",
  "us_citizen",
  "canadian_pr",
  "swiss_permit_c",
  "other_permit",
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
  const [workAuthorizations, setWorkAuthorizations] = useState<
    WorkAuthorization[]
  >((applicant.workAuthorizations ?? []) as WorkAuthorization[]);

  // WI4: Compensation + experience sliders
  // expectedCompMin is stored as numeric (string) in DB — parse to number | null
  const parsedCompMin = applicant.expectedCompMin
    ? Number(applicant.expectedCompMin)
    : null;
  const [expectedCompMin, setExpectedCompMin] = useState<number>(
    parsedCompMin !== null && !Number.isNaN(parsedCompMin) ? parsedCompMin : 0,
  );
  // 0 means "not set" — we use a boolean to track whether the user has set a value
  const [compEnabled, setCompEnabled] = useState<boolean>(
    parsedCompMin !== null && !Number.isNaN(parsedCompMin),
  );

  const [yearsOfExperience, setYearsOfExperience] = useState<number>(
    applicant.yearsOfExperience ?? 0,
  );
  const [expEnabled, setExpEnabled] = useState<boolean>(
    applicant.yearsOfExperience !== null,
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
    setWorkAuthorizations(
      (applicant.workAuthorizations ?? []) as WorkAuthorization[],
    );
    const resetCompMin = applicant.expectedCompMin
      ? Number(applicant.expectedCompMin)
      : null;
    setExpectedCompMin(
      resetCompMin !== null && !Number.isNaN(resetCompMin) ? resetCompMin : 0,
    );
    setCompEnabled(resetCompMin !== null && !Number.isNaN(resetCompMin));
    setYearsOfExperience(applicant.yearsOfExperience ?? 0);
    setExpEnabled(applicant.yearsOfExperience !== null);
  };

  useActionToast(
    state,
    "Preferences saved",
    "Failed to save preferences",
    onSaved,
  );

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
        workAuthorizations,
        // WI4: Only send values when the user has enabled the slider
        expectedCompMin: compEnabled ? expectedCompMin : null,
        yearsOfExperience: expEnabled ? yearsOfExperience : null,
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

      <div className="flex flex-col gap-2">
        <Label>Work authorizations / permits</Label>
        <p className="text-xs text-muted-foreground">
          Select any work permits or citizenship statuses you hold. Used to
          filter out jobs requiring authorization you don&apos;t have (e.g.,
          &quot;EU citizenship required&quot;). Optional — if none are set, jobs
          are not blocked on this basis but may show a verification warning.
        </p>
        <div className="flex flex-wrap gap-4">
          {WORK_AUTH_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`profile-work-auth-${value}`}
                checked={workAuthorizations.includes(value)}
                onCheckedChange={(_checked) =>
                  toggleArrayValue(
                    workAuthorizations,
                    value,
                    setWorkAuthorizations,
                  )
                }
              />
              <Label
                htmlFor={`profile-work-auth-${value}`}
                className="font-normal"
              >
                {WORK_AUTH_LABELS[value]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* WI4: Compensation expectation slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="profile-comp-min">
            Minimum expected compensation (annual, USD)
          </Label>
          <Checkbox
            id="profile-comp-enabled"
            checked={compEnabled}
            onCheckedChange={(checked) => setCompEnabled(checked === true)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {compEnabled
            ? `$${expectedCompMin.toLocaleString()}/year — jobs below this will be deprioritized`
            : "Not set — no compensation filtering applied"}
        </p>
        <Slider
          id="profile-comp-min"
          min={0}
          max={200000}
          step={5000}
          value={[expectedCompMin]}
          onValueChange={(values) => setExpectedCompMin(values[0] ?? 0)}
          disabled={!compEnabled}
        />
      </div>

      {/* WI4: Years of experience slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="profile-years-exp">Years of experience</Label>
          <Checkbox
            id="profile-exp-enabled"
            checked={expEnabled}
            onCheckedChange={(checked) => setExpEnabled(checked === true)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {expEnabled
            ? `${yearsOfExperience} years`
            : "Not set — no experience filtering applied"}
        </p>
        <Slider
          id="profile-years-exp"
          min={0}
          max={30}
          step={1}
          value={[yearsOfExperience]}
          onValueChange={(values) => setYearsOfExperience(values[0] ?? 0)}
          disabled={!expEnabled}
        />
      </div>

      <ProfileFormFooter
        state={state}
        isPending={isPending}
        saveLabel="Save preferences"
        onReset={reset}
        onCancel={onCancel}
      />
    </form>
  );
}
