import { ArrowLeft, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { VMMailClient } from "@/components/mail/VMMailClient";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "VM Mail | VectorMatch Admin",
  description: "Manage inbound VM Mail messages",
  robots: { index: false, follow: false },
};

export default async function VMMailPage() {
  await requireRole("admin", "/dashboard");

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-7xl mx-auto w-full">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Admin
      </Link>

      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Mail className="size-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight">VM Mail</h1>
          <p className="text-sm text-muted-foreground">
            Manage inbound and outbound email for vectormatch.dev
          </p>
        </div>
      </div>

      <VMMailClient />
    </main>
  );
}
