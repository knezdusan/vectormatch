import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password — VectorMatch",
  description: "Reset your VectorMatch account password",
  robots: { index: false, follow: false },
};

type ResetPasswordProps = {
  searchParams: Promise<{ token?: string }>;
};

export default function ResetPasswordPage({
  searchParams,
}: ResetPasswordProps) {
  return (
    <Suspense
      fallback={
        <main className="hero-aura pitch-surface min-h-screen flex items-center justify-center bg-background pb-4">
          <Spinner className="size-8" />
        </main>
      }
    >
      <ResetPasswordForm searchParams={searchParams} />
    </Suspense>
  );
}
