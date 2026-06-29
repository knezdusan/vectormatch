"use client";

// PersonaSection — editable personas with must-have tag selection
// src/components/onboarding/PersonaSection.tsx
//
// Renders one card per proposed persona (from the LLM extraction) plus an
// "Add persona" button (max 3 per MODULE_A_DECISIONS.md §9). Each persona card
// has:
//   - personaLabel (editable text input)
//   - embeddingSummary (editable textarea, 50-500 chars)
//   - SkillDragAndDrop for the 5 must_have_tags
//   - blocklistTags (optional, comma-separated input for MVP)
//
// The parent (OnboardingReview) owns the personas state and passes it down with
// an onChange callback. This keeps RHF form state as the single source of truth.

import { Plus, Trash2 } from "lucide-react";
import {
  MAX_MUST_HAVE_TAGS,
  SkillDragAndDrop,
} from "@/components/onboarding/SkillDragAndDrop";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  type SeniorityLevel,
  seniorityLevelsEnum,
} from "@/lib/onboarding/schemas";

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior (0-2 years)",
  mid: "Mid-level (2-5 years)",
  senior: "Senior (5-8 years)",
  lead: "Lead (8-12 years)",
  staff: "Staff (12+ years)",
  principal: "Principal (15+ years)",
};

const MAX_PERSONAS = 3;

// Persona passed to this section. The optional id is used by the post-
// onboarding editing flow so the parent can map edited personas back to DB rows.
// blocklistTags is optional because the profile editing schema lets it default.
type PersonaSectionPersona = {
  id?: string;
  personaId: string;
  personaLabel: string;
  embeddingSummary: string;
  mustHaveTags: string[];
  blocklistTags?: string[];
  seniorityLevels?: SeniorityLevel[];
};

// RHF's array field errors have a complex nested type. We use a loose shape
// that lets us access .personaLabel?.message etc. without fighting the type.
type PersonaFieldErrors = {
  personaLabel?: { message?: string };
  embeddingSummary?: { message?: string };
  mustHaveTags?: { message?: string } | { message?: string }[];
};

type PersonaSectionProps = {
  personas: PersonaSectionPersona[];
  availableSkills: string[];
  onChange: (next: PersonaSectionPersona[]) => void;
  errors?: PersonaFieldErrors[];
};

export function PersonaSection({
  personas,
  availableSkills,
  onChange,
  errors,
}: PersonaSectionProps) {
  const updatePersona = (
    index: number,
    patch: Partial<PersonaSectionPersona>,
  ) => {
    onChange(personas.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addPersona = () => {
    if (personas.length >= MAX_PERSONAS) return;
    onChange([
      ...personas,
      {
        personaId: `persona_${Date.now()}`,
        personaLabel: "",
        embeddingSummary: "",
        mustHaveTags: [],
        blocklistTags: [],
        seniorityLevels: [],
      },
    ]);
  };

  const removePersona = (index: number) => {
    onChange(personas.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personas</CardTitle>
        <CardDescription>
          Define the developer personas you want to be matched for. Each persona
          needs exactly {MAX_MUST_HAVE_TAGS} must-have tags (at least 1
          persona-defining) and a 3-sentence summary we use to generate your
          matching embedding.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {personas.map((persona, index) => (
          <div
            key={persona.personaId}
            className="flex flex-col gap-4 rounded-lg border border-border-soft bg-muted/40 p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-medium">
                Persona {index + 1}
                {persona.personaLabel ? ` — ${persona.personaLabel}` : ""}
              </h3>
              {personas.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePersona(index)}
                  aria-label={`Remove persona ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`persona-label-${index}`}>Persona label</Label>
              <Input
                id={`persona-label-${index}`}
                type="text"
                placeholder="e.g. Senior React Developer"
                value={persona.personaLabel}
                onChange={(e) =>
                  updatePersona(index, { personaLabel: e.target.value })
                }
              />
              {errors?.[index]?.personaLabel && (
                <p className="text-xs text-destructive">
                  {errors[index]?.personaLabel?.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`persona-summary-${index}`}>
                Embedding summary (50-500 chars)
              </Label>
              <Textarea
                id={`persona-summary-${index}`}
                rows={4}
                placeholder="A 3-sentence dense summary of this persona for matching. e.g. 'Senior React developer with 8 years building production SaaS apps. Strong in TypeScript, Next.js, and performance optimization. Prefers full-stack roles in fintech and developer-tooling companies.'"
                value={persona.embeddingSummary}
                onChange={(e) =>
                  updatePersona(index, { embeddingSummary: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {persona.embeddingSummary.length}/500 characters
              </p>
              {errors?.[index]?.embeddingSummary && (
                <p className="text-xs text-destructive">
                  {errors[index]?.embeddingSummary?.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Must-have tags ({persona.mustHaveTags.length}/5)</Label>
              <SkillDragAndDrop
                availableSkills={availableSkills}
                mustHaveTags={persona.mustHaveTags}
                onChange={(next) =>
                  updatePersona(index, { mustHaveTags: next })
                }
              />
              {errors?.[index]?.mustHaveTags && (
                <p className="text-xs text-destructive">
                  Each persona needs exactly 5 must-have tags, at least 1
                  persona-defining.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`persona-blocklist-${index}`}>
                Blocklist tags (optional, comma-separated)
              </Label>
              <Input
                id={`persona-blocklist-${index}`}
                type="text"
                placeholder="e.g. legacy, on-call"
                value={(persona.blocklistTags ?? []).join(", ")}
                onChange={(e) =>
                  updatePersona(index, {
                    blocklistTags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Jobs matching these tags will never be routed to this persona.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Seniority levels (max 3, must be adjacent)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {seniorityLevelsEnum.options.map((option) => {
                  const checked = (persona.seniorityLevels ?? []).includes(
                    option,
                  );
                  return (
                    <div key={option} className="flex items-center gap-2">
                      <Checkbox
                        id={`persona-${index}-seniority-${option}`}
                        checked={checked}
                        onCheckedChange={() => {
                          const current = persona.seniorityLevels ?? [];
                          const next = checked
                            ? current.filter((v) => v !== option)
                            : [...current, option];
                          updatePersona(index, { seniorityLevels: next });
                        }}
                      />
                      <Label
                        htmlFor={`persona-${index}-seniority-${option}`}
                        className="font-normal"
                      >
                        {SENIORITY_LABELS[option]}
                      </Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Select the seniority levels this persona should match. Maximum 3
                consecutive levels (e.g., senior, lead, staff).
              </p>
            </div>
          </div>
        ))}

        {personas.length < MAX_PERSONAS && (
          <Button
            type="button"
            variant="outline"
            onClick={addPersona}
            className="w-fit"
          >
            <Plus className="h-4 w-4 mr-2" /> Add another persona (
            {personas.length}/{MAX_PERSONAS})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export type { PersonaSectionProps };
