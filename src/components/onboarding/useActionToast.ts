"use client";

// useActionToast — shared toast side-effect for Profile Management forms
// src/components/onboarding/useActionToast.ts
//
// Extracts the duplicated useEffect that watches useActionState output and
// fires a success/error toast. Was repeated across ProfilePersonasForm,
// ProfilePreferencesForm, and ProfileWorkHistoryForm with only the toast
// messages differing.

import { useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/actions/profile";

export function useActionToast(
  state: ActionState,
  successMessage: string,
  errorMessage: string,
  onSaved?: () => void,
): void {
  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(successMessage);
      onSaved?.();
    } else if (state.error) {
      toast.error(errorMessage, { description: state.error });
    }
  }, [state, successMessage, errorMessage, onSaved]);
}
