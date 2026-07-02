"use client";

import { ArrowLeft, Mail, Reply, Send, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface MailDetailProps {
  email: Record<string, unknown> | null;
  loading: boolean;
  tab: string;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onToggleRead: (id: string, isRead: boolean) => void;
  onReply: (email: Record<string, unknown>) => void;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function MailDetail({
  email,
  loading,
  tab,
  onDelete,
  onRestore,
  onPermanentDelete,
  onToggleRead,
  onReply,
}: MailDetailProps) {
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (email && typeof email.htmlBody === "string") {
      setRenderedHtml(email.htmlBody as string);
    } else if (email && typeof email.textBody === "string") {
      setRenderedHtml(null);
    } else {
      setRenderedHtml(null);
    }
  }, [email]);

  if (loading) {
    return (
      <Card className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="size-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading email...</p>
        </div>
      </Card>
    );
  }

  if (!email) {
    return (
      <Card className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <Mail className="size-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Select an email to read
          </p>
        </div>
      </Card>
    );
  }

  const id = email.id as string;
  const fromAddress = email.fromAddress as string;
  const toAddress = email.toAddress as string;
  const subject = (email.subject as string) || "(no subject)";
  const createdAt = email.createdAt as Date | string;
  const isRead = email.isRead as boolean | undefined;
  const isTrash = tab === "trash";
  const isSent = tab === "sent" || email._type === "sent";
  const textBody = email.textBody as string | null;
  const headers = email.headers as string | null;
  const cc = email.cc as string | null | undefined;
  const status = email.status as string | null | undefined;
  const error = email.error as string | null | undefined;

  // Parse headers for display
  let parsedHeaders: Record<string, string> = {};
  if (headers) {
    try {
      parsedHeaders = JSON.parse(headers) as Record<string, string>;
    } catch {
      // ignore parse errors
    }
  }

  return (
    <Card className="flex-1 flex flex-col min-h-[400px] max-h-[700px]">
      {/* Header / toolbar */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 lg:hidden"
            onClick={() => {
              // Deselect — parent handles via state
              window.dispatchEvent(new CustomEvent("vm-mail-deselect"));
            }}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="truncate text-sm font-semibold">{subject}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Inbox actions */}
          {!isTrash && !isSent && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleRead(id, !isRead)}
                title={isRead ? "Mark as unread" : "Mark as read"}
              >
                <Mail className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply(email)}
                title="Reply"
              >
                <Reply className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(id)}
                title="Move to trash"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}

          {/* Sent actions */}
          {!isTrash && isSent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(id)}
              title="Move to trash"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}

          {/* Trash actions */}
          {isTrash && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRestore(id)}
                title="Restore"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPermanentDelete(id)}
                title="Delete permanently"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Email metadata */}
      <div className="px-4 py-3 space-y-2 border-b border-border">
        <div className="flex items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0 w-12">From</span>
          <span className="font-medium">{fromAddress}</span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0 w-12">To</span>
          <span>{toAddress}</span>
        </div>
        {cc && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground shrink-0 w-12">Cc</span>
            <span>{cc}</span>
          </div>
        )}
        <div className="flex items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0 w-12">Date</span>
          <span>{formatDate(createdAt)}</span>
        </div>
        {isSent && status && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground shrink-0 w-12">Status</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                status === "sent" || status === "delivered"
                  ? "bg-accent/15 text-accent-foreground"
                  : status === "bounced" || status === "complained"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {status}
            </span>
          </div>
        )}
      </div>

      <Separator />

      {/* Email body */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderedHtml ? (
          <iframe
            srcDoc={`<div style="white-space: pre-wrap; font-size: 0.875rem; font-family: sans-serif; word-wrap: break-word; color: #fff;">${renderedHtml}</div>`}
            title="Email content"
            sandbox="allow-same-origin"
            className="w-full h-full min-h-[300px] border-0"
            style={{ colorScheme: "light" }}
          />
        ) : textBody ? (
          <pre className="whitespace-pre-wrap text-sm font-sans break-words">
            {textBody}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <Send className="size-6 mx-auto text-muted-foreground/50" />
              <p>No content available</p>
              {email.status === "received" && (
                <p className="text-xs">Content is still being fetched...</p>
              )}
              {email.status === "error" && (
                <p className="text-xs text-destructive">Error: {error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Headers (collapsible) */}
      {parsedHeaders && Object.keys(parsedHeaders).length > 0 && (
        <details className="border-t border-border">
          <summary className="px-4 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-muted/50">
            Show raw headers
          </summary>
          <div className="px-4 py-2 max-h-48 overflow-y-auto bg-muted/30">
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(parsedHeaders, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </Card>
  );
}
