"use client";

// ProfilePersonasForm — editable personas for State 3
// src/components/onboarding/ProfilePersonasForm.tsx

import { startTransition, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updatePersonasAction } from "@/actions/profile";
import { PersonaSection } from "@/components/onboarding/PersonaSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success("Personas saved");
      onSaved?.();
    } else if (state.error) {
      toast.error("Failed to save personas", { description: state.error });
    }
  }, [state, onSaved]);

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

      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          Save personas
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
