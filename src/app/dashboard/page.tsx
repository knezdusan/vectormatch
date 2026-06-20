import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db/db";
import { applicant } from "@/db/schemas";
import { getAuthSession } from "@/lib/auth";

export default async function Dashboard() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/auth?tab=signin");
  }

  // Smart redirect: not onboarded → profile-management, onboarded → jobs.
  // This catches all entry paths (social sign-in callback, direct URL,
  // bookmarks) that bypass the signInAction's redirect logic.
  const [userApplicant] = await db
    .select({ isOnboarded: applicant.isOnboarded })
    .from(applicant)
    .where(eq(applicant.userId, session.user.id))
    .limit(1);

  if (userApplicant?.isOnboarded) {
    redirect("/dashboard/jobs");
  }

  redirect("/dashboard/profile-management");

  // Unreachable — all paths above call redirect(). Satisfies the type
  // checker so this page is a valid async Server Component.
  return null;
}
