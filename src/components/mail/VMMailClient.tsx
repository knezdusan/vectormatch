"use client";

import { Inbox, MailPlus, RefreshCw, Search, Send, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deleteInboundEmailAction,
  deleteSentEmailAction,
  getInboundEmail,
  getSentEmail,
  listInboundEmails,
  listSentEmails,
  type MailActionState,
  markEmailReadAction,
  permanentDeleteInboundAction,
  permanentDeleteSentAction,
  restoreInboundEmailAction,
  restoreSentEmailAction,
  sendMailAction,
  syncInboundEmailsAction,
} from "@/actions/mail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailCompose } from "./MailCompose";
import { MailDetail } from "./MailDetail";
import { MailList } from "./MailList";

type Tab = "inbox" | "compose" | "sent" | "trash";

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
};

export function VMMailClient() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Unread count is derived from the current inbox items so it stays in sync
  // when an email is opened or toggled read/unread without needing a full reload.
  const unreadCount = useMemo(
    () => items.filter((item) => item.isRead === false).length,
    [items],
  );

  // ── Send mail state ────────────────────────────────────────────────────────
  const [sendState, sendAction] = useActionState<MailActionState, FormData>(
    sendMailAction,
    { success: false },
  );

  useEffect(() => {
    if (sendState.success) {
      toast.success("Email sent successfully");
      setTab("sent");
    } else if (sendState.error) {
      toast.error(sendState.error);
    }
  }, [sendState]);

  // ── Load list when tab or filters change ───────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadList is a closure that depends on tab/search/sort
  useEffect(() => {
    if (tab === "compose") return;
    loadList();
  }, [tab, search, sort]);

  async function loadList() {
    setLoading(true);
    setSelectedId(null);
    setSelectedEmail(null);
    try {
      if (tab === "inbox") {
        const rows = await listInboundEmails({
          folder: "inbox",
          search: search || undefined,
          sort,
        });
        setItems(rows as ListItem[]);
      } else if (tab === "trash") {
        // Trash shows both inbound and sent trashed emails
        const [inbound, sent] = await Promise.all([
          listInboundEmails({
            folder: "trash",
            search: search || undefined,
            sort,
          }),
          listSentEmails({
            folder: "trash",
            search: search || undefined,
            sort,
          }),
        ]);
        const combined = [
          ...(inbound as ListItem[]).map((r) => ({
            ...r,
            _type: "inbound" as const,
          })),
          ...(sent as ListItem[]).map((r) => ({
            ...r,
            _type: "sent" as const,
          })),
        ];
        // Sort by date
        combined.sort((a, b) => {
          const da = new Date(a.createdAt).getTime();
          const db = new Date(b.createdAt).getTime();
          return sort === "newest" ? db - da : da - db;
        });
        setItems(combined);
      } else if (tab === "sent") {
        const rows = await listSentEmails({
          folder: "sent",
          search: search || undefined,
          sort,
        });
        setItems(rows as ListItem[]);
      }
    } catch {
      toast.error("Failed to load emails");
    } finally {
      setLoading(false);
    }
  }

  // ── Sync new emails from Resend ────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncInboundEmailsAction();
      if (result.success) {
        if (result.newCount > 0) {
          toast.success(
            `${result.newCount} new email${result.newCount > 1 ? "s" : ""} synced`,
          );
          await loadList();
        } else {
          toast.info("No new emails found");
        }
      } else {
        toast.error(result.error ?? "Failed to sync emails");
      }
    } catch {
      toast.error("Failed to sync emails");
    } finally {
      setSyncing(false);
    }
  }

  // ── Select and view an email ───────────────────────────────────────────────
  async function selectEmail(id: string, type: "inbound" | "sent") {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const email =
        type === "inbound" ? await getInboundEmail(id) : await getSentEmail(id);
      setSelectedEmail(email);
      if (tab === "inbox") {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, isRead: true } : item,
          ),
        );
      }
    } catch {
      toast.error("Failed to load email");
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, type: "inbound" | "sent") {
    const action =
      type === "inbound" ? deleteInboundEmailAction : deleteSentEmailAction;
    const res = await action(id);
    if (res.success) {
      toast.success("Moved to trash");
      setSelectedId(null);
      setSelectedEmail(null);
      loadList();
    } else {
      toast.error(res.error ?? "Failed to delete");
    }
  }

  async function handleRestore(id: string, type: "inbound" | "sent") {
    const action =
      type === "inbound" ? restoreInboundEmailAction : restoreSentEmailAction;
    const res = await action(id);
    if (res.success) {
      toast.success("Restored");
      setSelectedId(null);
      setSelectedEmail(null);
      loadList();
    } else {
      toast.error(res.error ?? "Failed to restore");
    }
  }

  async function handlePermanentDelete(id: string, type: "inbound" | "sent") {
    const action =
      type === "inbound"
        ? permanentDeleteInboundAction
        : permanentDeleteSentAction;
    const res = await action(id);
    if (res.success) {
      toast.success("Permanently deleted");
      setSelectedId(null);
      setSelectedEmail(null);
      loadList();
    } else {
      toast.error(res.error ?? "Failed to delete permanently");
    }
  }

  async function handleToggleRead(id: string, isRead: boolean) {
    const res = await markEmailReadAction(id, isRead);
    if (res.success) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isRead } : item)),
      );
    }
  }

  function handleReply(email: Record<string, unknown>) {
    setSelectedEmail(null);
    setSelectedId(null);
    setTab("compose");
    // The compose component will read a query param or we pass via state
    // For simplicity, we use a custom event
    window.dispatchEvent(new CustomEvent("vm-mail-reply", { detail: email }));
  }

  const tabs: { value: Tab; label: string; icon: typeof Inbox }[] = [
    { value: "inbox", label: "Inbox", icon: Inbox },
    { value: "compose", label: "Compose", icon: MailPlus },
    { value: "sent", label: "Sent", icon: Send },
    { value: "trash", label: "Trash", icon: Trash2 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <Card className="p-1">
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="flex items-center gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-sm relative"
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {t.value === "inbox" && unreadCount > 0 && (
                    <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Card>
      </Tabs>

      {/* Content area */}
      {tab === "compose" ? (
        <MailCompose sendAction={sendAction} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr] min-h-[600px]">
          {/* Left: List panel */}
          <div className="flex flex-col gap-3">
            {/* Search + sort + sync */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                title="Check Resend for new emails"
                className="shrink-0"
              >
                <RefreshCw
                  className={`size-4 ${syncing ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">
                  {syncing ? "Syncing..." : "Check now"}
                </span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
                className="shrink-0"
              >
                {sort === "newest" ? "Newest" : "Oldest"}
              </Button>
            </div>

            <MailList
              items={items}
              loading={loading}
              selectedId={selectedId}
              onSelect={(id) => {
                // Determine type based on current tab
                const type = tab === "sent" ? "sent" : "inbound";
                selectEmail(id, type);
              }}
              tab={tab}
            />
          </div>

          {/* Right: Detail panel */}
          <MailDetail
            email={selectedEmail}
            loading={detailLoading}
            tab={tab}
            onDelete={(id) => {
              const type =
                (selectedEmail as { _type?: string })?._type === "sent"
                  ? "sent"
                  : tab === "sent"
                    ? "sent"
                    : "inbound";
              handleDelete(id, type as "inbound" | "sent");
            }}
            onRestore={(id) => {
              const type =
                (selectedEmail as { _type?: string })?._type === "sent"
                  ? "sent"
                  : tab === "sent"
                    ? "sent"
                    : "inbound";
              handleRestore(id, type as "inbound" | "sent");
            }}
            onPermanentDelete={(id) => {
              const type =
                (selectedEmail as { _type?: string })?._type === "sent"
                  ? "sent"
                  : tab === "sent"
                    ? "sent"
                    : "inbound";
              handlePermanentDelete(id, type as "inbound" | "sent");
            }}
            onToggleRead={handleToggleRead}
            onReply={handleReply}
          />
        </div>
      )}
    </div>
  );
}
