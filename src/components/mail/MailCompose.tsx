"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface MailComposeProps {
  // The bound action from useActionState — triggers the server action
  sendAction: (formData: FormData) => void;
}

function extractEmail(address: string): string {
  const match = address.match(/<(.+?)>/);
  return match ? match[1] : address;
}

export function MailCompose({ sendAction }: MailComposeProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);

  // Listen for reply events from VMMailClient
  useEffect(() => {
    function handleReply(e: Event) {
      const detail = (e as CustomEvent).detail as Record<string, unknown>;
      const from = detail.fromAddress as string;
      const subject = detail.subject as string;
      const to = extractEmail(from);

      // Populate form fields
      const toField = document.getElementById("compose-to") as HTMLInputElement;
      const subjectField = document.getElementById(
        "compose-subject",
      ) as HTMLInputElement;
      if (toField) toField.value = to;
      if (subjectField) {
        const prefix = subject.startsWith("Re:") ? "" : "Re: ";
        subjectField.value = `${prefix}${subject || ""}`;
      }
    }
    window.addEventListener("vm-mail-reply", handleReply);
    return () => window.removeEventListener("vm-mail-reply", handleReply);
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    const formData = new FormData(e.currentTarget);

    // If not in HTML mode, wrap text body in basic HTML
    const body = formData.get("htmlBody") as string;
    if (!htmlMode && body) {
      formData.set(
        "htmlBody",
        `<div style="font-family: system-ui, sans-serif; white-space: pre-wrap;">${escapeHtml(body)}</div>`,
      );
    }

    // Submit via server action
    Promise.resolve(sendAction(formData)).finally(() => {
      setSending(false);
      formRef.current?.reset();
    });
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return (
    <Card className="p-6 max-w-3xl mx-auto w-full">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {/* Recipients */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Label
              htmlFor="compose-to"
              className="text-sm text-muted-foreground w-12 shrink-0"
            >
              To
            </Label>
            <Input
              id="compose-to"
              name="to"
              type="text"
              placeholder="recipient@example.com, another@example.com"
              required
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCc(!showCc)}
              className="text-xs shrink-0"
            >
              {showCc ? "Hide Cc/Bcc" : "Add Cc/Bcc"}
            </Button>
          </div>

          {showCc && (
            <>
              <div className="flex gap-2 items-center">
                <Label
                  htmlFor="compose-cc"
                  className="text-sm text-muted-foreground w-12 shrink-0"
                >
                  Cc
                </Label>
                <Input
                  id="compose-cc"
                  name="cc"
                  type="text"
                  placeholder="cc@example.com"
                  className="flex-1"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Label
                  htmlFor="compose-bcc"
                  className="text-sm text-muted-foreground w-12 shrink-0"
                >
                  Bcc
                </Label>
                <Input
                  id="compose-bcc"
                  name="bcc"
                  type="text"
                  placeholder="bcc@example.com"
                  className="flex-1"
                />
              </div>
            </>
          )}
        </div>

        {/* Subject */}
        <div className="flex gap-2 items-center">
          <Label
            htmlFor="compose-subject"
            className="text-sm text-muted-foreground w-12 shrink-0"
          >
            Subject
          </Label>
          <Input
            id="compose-subject"
            name="subject"
            type="text"
            placeholder="Email subject"
            required
            className="flex-1"
          />
        </div>

        {/* Body */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="compose-body"
              className="text-sm text-muted-foreground"
            >
              Message
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHtmlMode(!htmlMode)}
              className="text-xs"
            >
              {htmlMode ? "Plain text" : "HTML mode"}
            </Button>
          </div>
          <Textarea
            id="compose-body"
            name="htmlBody"
            placeholder={
              htmlMode ? "Enter HTML content..." : "Type your message here..."
            }
            required
            className="min-h-[300px] font-mono text-sm resize-y"
          />
          <input type="hidden" name="textBody" value="" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Emails are sent via Resend from{" "}
            <span className="font-medium">
              {process.env.NEXT_PUBLIC_MAIL_FROM || "noreply@vectormatch.dev"}
            </span>
          </p>
          <Button type="submit" disabled={sending} className="min-w-[120px]">
            {sending ? (
              <>
                <div className="size-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="size-4" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
