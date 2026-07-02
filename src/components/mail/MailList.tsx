"use client";

import { Clock, Mail, MailOpen, Paperclip, Send, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";

type ListItem = {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  isRead?: boolean;
  status: string;
  hasHtml: boolean;
  createdAt: Date | string;
  cc?: string | null;
  attachmentCount?: string | number | null;
  _type?: "inbound" | "sent";
};

interface MailListProps {
  items: ListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: string;
}

function formatRelativeDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function extractEmailName(address: string): string {
  // Extract name from "Name <email>" or just return the email
  const match = address.match(/^(.*?)\s*<.*>$/);
  if (match?.[1].trim()) return match[1].trim().replace(/"/g, "");
  return address;
}

export function MailList({
  items,
  loading,
  selectedId,
  onSelect,
  tab,
}: MailListProps) {
  if (loading) {
    return (
      <Card className="flex-1 p-4">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`skeleton-${i.toString()}`}
              className="flex gap-3 items-center animate-pulse"
            >
              <div className="size-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
        <div className="text-center space-y-2">
          {tab === "inbox" && (
            <>
              <Mail className="size-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Inbox is empty</p>
            </>
          )}
          {tab === "sent" && (
            <>
              <Send className="size-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No sent emails</p>
            </>
          )}
          {tab === "trash" && (
            <>
              <Trash2 className="size-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Trash is empty</p>
            </>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex-1 overflow-hidden">
      <div className="divide-y divide-border max-h-[700px] overflow-y-auto">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          const isUnread = tab === "inbox" && !item.isRead;
          const displayName =
            tab === "sent"
              ? `To: ${extractEmailName(item.toAddress)}`
              : extractEmailName(item.fromAddress);
          const SentIcon =
            tab === "sent" || item._type === "sent" ? Send : null;
          const MailIcon = SentIcon ?? (isUnread ? Mail : MailOpen);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 items-start ${
                isSelected ? "bg-muted" : ""
              } ${isUnread ? "font-medium" : ""}`}
            >
              <div
                className={`mt-0.5 shrink-0 size-9 rounded-full grid place-items-center ${
                  isUnread
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <MailIcon className="size-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      isUnread
                        ? "font-semibold text-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {displayName}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="size-3" />
                    {formatRelativeDate(item.createdAt)}
                  </span>
                </div>
                <p
                  className={`truncate text-sm ${
                    isUnread ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {item.subject || "(no subject)"}
                </p>
                <div className="flex items-center gap-2">
                  {isUnread && (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                  {item.hasHtml && (
                    <span className="text-xs text-muted-foreground">HTML</span>
                  )}
                  {Number(item.attachmentCount) > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Paperclip className="size-3" />
                      {item.attachmentCount}
                    </span>
                  )}
                  {item.status === "error" && (
                    <span className="text-xs text-destructive">error</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
