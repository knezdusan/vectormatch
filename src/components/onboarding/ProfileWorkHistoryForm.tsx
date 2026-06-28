"use client";

// ProfileWorkHistoryForm — editable work history for State 3
// src/components/onboarding/ProfileWorkHistoryForm.tsx

import { startTransition, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateWorkHistoryAction } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { WorkingHistory } from "@/db/schemas/jobs/workingHistory";
import { TagMultiSelect } from "./TagMultiSelect";

type WorkHistoryEntryForm = {
  id?: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  summary: string | null;
  canonicalSkillsDetected: string[];
  rawSkillsDetected: string[];
};

type ProfileWorkHistoryFormProps = {
  workHistory: WorkingHistory[];
  onSaved?: () => void;
  onCancel?: () => void;
};

function toInputDateString(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function emptyEntry(): WorkHistoryEntryForm {
  return {
    company: "",
    role: "",
    startDate: "",
    endDate: null,
    isCurrent: false,
    summary: null,
    canonicalSkillsDetected: [],
    rawSkillsDetected: [],
  };
}

function workHistoryToEntries(
  history: WorkingHistory[],
): WorkHistoryEntryForm[] {
  return history.map((entry) => ({
    id: entry.id,
    company: entry.company,
    role: entry.role,
    startDate: toInputDateString(entry.startDate),
    endDate: toInputDateString(entry.endDate),
    isCurrent: entry.isCurrent,
    summary: entry.summary,
    canonicalSkillsDetected: entry.canonicalSkillsDetected,
    rawSkillsDetected: entry.rawSkillsDetected,
  }));
}

export function ProfileWorkHistoryForm({
  workHistory,
  onSaved,
  onCancel,
}: ProfileWorkHistoryFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateWorkHistoryAction,
    null,
  );
  const [entries, setEntries] = useState<WorkHistoryEntryForm[]>(() =>
    workHistoryToEntries(workHistory),
  );

  const reset = () => {
    setEntries(workHistoryToEntries(workHistory));
  };

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success("Work history saved");
      onSaved?.();
    } else if (state.error) {
      toast.error("Failed to save work history", { description: state.error });
    }
  }, [state, onSaved]);

  const updateEntry = (index: number, patch: Partial<WorkHistoryEntryForm>) => {
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, emptyEntry()]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        entries: entries.map((entry) => ({
          ...entry,
          endDate: entry.isCurrent ? null : entry.endDate,
          summary: entry.summary ?? null,
          rawSkillsDetected: entry.rawSkillsDetected.length
            ? entry.rawSkillsDetected
            : entry.canonicalSkillsDetected,
        })),
      }),
    );
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {entries.map((entry, index) => (
        <div
          key={entry.id ?? `new-${index}`}
          className="flex flex-col gap-4 rounded-lg border border-border-soft bg-muted/40 p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Entry {index + 1}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeEntry(index)}
            >
              Remove
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`company-${index}`}>Company</Label>
              <Input
                id={`company-${index}`}
                type="text"
                value={entry.company}
                onChange={(e) =>
                  updateEntry(index, { company: e.target.value })
                }
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`role-${index}`}>Role</Label>
              <Input
                id={`role-${index}`}
                type="text"
                value={entry.role}
                onChange={(e) => updateEntry(index, { role: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`start-${index}`}>Start date (YYYY-MM)</Label>
              <Input
                id={`start-${index}`}
                type="text"
                placeholder="2020-01"
                value={entry.startDate}
                onChange={(e) =>
                  updateEntry(index, { startDate: e.target.value })
                }
                required
              />
            </div>
            <div className="flex flex-col gap-2">
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
            <Label htmlFor={`current-${index}`} className="font-normal">
              I currently work here
            </Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Skills for this role</Label>
            <TagMultiSelect
              selectedTags={entry.canonicalSkillsDetected}
              onChange={(next) =>
                updateEntry(index, { canonicalSkillsDetected: next })
              }
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addEntry}
        className="w-fit"
      >
        Add job entry
      </Button>

      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          Save work history
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
