"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { updateMatchStatus } from "@/actions/matches";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const STATUS_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "stale", label: "Closed" },
  { value: "pending", label: "Pending" },
  { value: "mark_read", label: "Read" },
  { value: "mismatch", label: "Mismatch" },
  { value: "applied", label: "Applied" },
] as const;

function statusLabel(status: string): string {
  const option = STATUS_OPTIONS.find((option) => option.value === status);
  return option?.label ?? status;
}

export function MatchStatusSelect({
  matchQueueId,
  currentStatus,
}: {
  matchQueueId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function handleChange(value: string) {
    if (value === currentStatus) return;

    setUpdating(true);
    const result = await updateMatchStatus(
      matchQueueId,
      value as Parameters<typeof updateMatchStatus>[1],
    );
    setUpdating(false);

    if (result.success) {
      toast.success(`Status updated to ${statusLabel(value)}`);
      router.push("/dashboard/jobs");
    } else {
      toast.error(result.error ?? "Failed to update status");
    }
  }

  const currentOption = STATUS_OPTIONS.find(
    (option) => option.value === currentStatus,
  );

  return (
    <div className="flex items-center gap-2">
      {updating && <Spinner className="size-4" />}
      <Select
        value={currentStatus}
        onValueChange={handleChange}
        disabled={updating}
      >
        <SelectTrigger size="sm" className="w-44">
          <SelectValue>
            {currentOption?.label ?? statusLabel(currentStatus)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
