import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default async function Dashboard() {
  const session = await authClient.getSession({
    fetchOptions: {
      onSuccess: () => {},
      onError: () => {},
    },
  });

  if (!session.data) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to Dashboard</h1>
        <p className="text-muted-foreground">
          Logged in as: {session.data.user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Name: {session.data.user.name}
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
    </div>
  );
}
