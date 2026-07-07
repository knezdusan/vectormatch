"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Store the job ID the user wants to view in a cookie, then redirect to the
 * sign-up flow. After successful signup/sign-in, the auth flow redirects back
 * to `/jobs/${jobId}`.
 */
export async function redirectToJobSignup(jobId: string) {
  const cookieStore = await cookies();
  cookieStore.set("vm_pending_job_id", jobId, {
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
    sameSite: "lax",
  });

  redirect("/auth?tab=signup");
}
