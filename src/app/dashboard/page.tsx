import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";

export default async function Dashboard() {
  // Use the server-side SDK — it reads the session cookie from the current
  // request headers directly, no outbound HTTP fetch required.
  const session = await getAuthSession();
  console.log(session);

  if (!session) {
    redirect("/auth");
  }

  return (
    <main className="hero-aura min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to Dashboard</h1>
        <p className="text-muted-foreground">
          Logged in as: {session.user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Name: {session.user.name}
        </p>
        <form action="/api/auth/sign-out" method="POST">
          <button
            type="submit"
            className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90"
          >
            Sign Out
          </button>
        </form>
      </div>
    </main>
  );
}
