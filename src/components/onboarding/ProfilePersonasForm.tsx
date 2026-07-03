"use client";

// ProfilePersonasForm — editable personas for State 3
// src/components/onboarding/ProfilePersonasForm.tsx

import { startTransition, useActionState, useState } from "react";
import { updatePersonasAction } from "@/actions/profile";
import { PersonaSection } from "@/components/onboarding/PersonaSection";
import { ProfileFormFooter } from "@/components/onboarding/ProfileFormFooter";
import { useActionToast } from "@/components/onboarding/useActionToast";
import type { Persona } from "@/db/schemas/jobs/persona";
import type { PersonaInput } from "@/lib/onboarding/profile-schemas";

type ProfilePersonasFormProps = {
  personas: Persona[];
  availableSkills: string[];
  onSaved?: () => void;
  onCancel?: () => void;
};

function personasToInput(personas: Persona[]): PersonaInput[] {
  return personas.map((p) => ({
    id: p.id,
    personaId: p.personaId,
    personaLabel: p.personaLabel,
    embeddingSummary: p.embeddingSummary,
    mustHaveTags: p.mustHaveTags,
    blocklistTags: p.blocklistTags,
    seniorityLevels: (p.seniorityLevels ??
      []) as PersonaInput["seniorityLevels"],
  }));
}

export function ProfilePersonasForm({
  personas,
  availableSkills,
  onSaved,
  onCancel,
}: ProfilePersonasFormProps) {
  const [state, formAction, isPending] = useActionState(
    updatePersonasAction,
    null,
  );
  const [draftPersonas, setDraftPersonas] = useState<PersonaInput[]>(() =>
    personasToInput(personas),
  );

  const reset = () => {
    setDraftPersonas(personasToInput(personas));
  };

  useActionToast(state, "Personas saved", "Failed to save personas", onSaved);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ personas: draftPersonas }));
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <PersonaSection
        personas={draftPersonas}
        availableSkills={availableSkills}
        onChange={setDraftPersonas}
      />

      <ProfileFormFooter
        state={state}
        isPending={isPending}
        saveLabel="Save personas"
        onReset={reset}
        onCancel={onCancel}
      />
    </form>
  );
}
