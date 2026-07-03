"use client";

// ProfileFormFooter — shared form footer for Profile Management edit forms
// src/components/onboarding/ProfileFormFooter.tsx
//
// Extracts the duplicated (error display + Save/Cancel buttons) block that was
// repeated across ProfilePersonasForm, ProfilePreferencesForm, and
// ProfileWorkHistoryForm. Each form had the same ~30-line JSX with only the
// save label differing.

import type { ActionState } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ProfileFormFooterProps = {
  state: ActionState;
  isPending: boolean;
  saveLabel: string;
  onReset: () => void;
  onCancel?: () => void;
};

export function ProfileFormFooter({
  state,
  isPending,
  saveLabel,
  onReset,
  onCancel,
}: ProfileFormFooterProps) {
  return (
    <>
      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          {saveLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            onReset();
            onCancel?.();
          }}
        >
          Cancel
        </Button>
      </div>
    </>
  );
}
