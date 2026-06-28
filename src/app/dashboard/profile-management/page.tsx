// Profile Management Page — single route, three presentations
// src/app/dashboard/profile-management/page.tsx
//
// Module A onboarding state machine (MODULE_A_DECISIONS.md §8):
//   State 1 — isOnboarded=false, no valid cvUpload  → CV upload form
//   State 2 — isOnboarded=false, valid cvUpload      → Onboarding review
//   State 3 — isOnboarded=true                       → Profile management
//
// The dashboard layout already enforces authentication (redirects to /auth),
// so this page can assume `session` is non-null. We still guard defensively.

import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { CvUploadForm } from "@/components/onboarding/CvUploadForm";
import { OnboardingReview } from "@/components/onboarding/OnboardingReview";
import { ProfileManagement } from "@/components/onboarding/ProfileManagement";
import { db } from "@/db/db";
import {
  applicant,
  cvUpload,
  persona,
  tagsExperience,
  workingHistory,
} from "@/db/schemas";
import type { Applicant } from "@/db/schemas/jobs/applicant";
import type { CvUpload } from "@/db/schemas/jobs/cvUpload";
import type { Persona } from "@/db/schemas/jobs/persona";
import type { TagsExperience } from "@/db/schemas/jobs/tagsExperience";
import type { WorkingHistory } from "@/db/schemas/jobs/workingHistory";
import { getAuthSession } from "@/lib/auth";

export const metadata = {
  title: "Profile Management | VectorMatch",
  description:
    "Upload your CV, review your extracted profile, and manage your personas",
};

export default async function ProfileManagementPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/auth?callbackUrl=%2Fdashboard%2Fprofile-management");
  }

  const userId = session.user.id;

  const [userApplicant] = await db
    .select()
    .from(applicant)
    .where(eq(applicant.userId, userId))
    .limit(1);

  // State 3: already onboarded → full profile management.
  // Fetch the related personas, work history, tag experience, and latest CV for display.
  if (userApplicant?.isOnboarded) {
    const [personas, history, tags, latestCv] = await Promise.all([
      db
        .select()
        .from(persona)
        .where(eq(persona.applicantId, userId))
        .orderBy(asc(persona.createdAt)),
      db
        .select()
        .from(workingHistory)
        .where(eq(workingHistory.applicantId, userId))
        .orderBy(desc(workingHistory.startDate)),
      db
        .select()
        .from(tagsExperience)
        .where(eq(tagsExperience.applicantId, userId))
        .orderBy(desc(tagsExperience.yearsOfExperience)),
      db
        .select()
        .from(cvUpload)
        .where(eq(cvUpload.applicantId, userId))
        .orderBy(desc(cvUpload.createdAt))
        .limit(1),
    ]);

    return (
      <ProfileManagement
        applicant={userApplicant as Applicant}
        personas={personas as Persona[]}
        workHistory={history as WorkingHistory[]}
        tagsExperience={tags as TagsExperience[]}
        latestCvUpload={(latestCv[0] as CvUpload | undefined) ?? null}
      />
    );
  }

  // State 1 or 2: check for the most recent cvUpload
  const [latestCv] = await db
    .select()
    .from(cvUpload)
    .where(eq(cvUpload.applicantId, userId))
    .orderBy(desc(cvUpload.createdAt))
    .limit(1);

  // State 2: valid extraction exists → onboarding review
  if (latestCv?.status === "valid" && latestCv.extractedJson) {
    return (
      <OnboardingReview
        cvUpload={latestCv as CvUpload}
        applicant={(userApplicant as Applicant | undefined) ?? null}
      />
    );
  }

  // State 1: no usable CV → upload form
  return <CvUploadForm />;
}
