import { Play } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutFormButton } from "@/components/auth/SignOutFormButton";
import { Spinner } from "@/components/ui/spinner";
import { getAuthSession } from "@/lib/auth";

async function ClientData() {
  // Use the server-side SDK — it reads the session cookie from the current
  // request headers directly, no outbound HTTP fetch required.
  const session = await getAuthSession();

  if (!session) {
    redirect("/auth");
  }

  return (
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        Logged in as: {session.user.email}
      </p>
      <p className="text-sm text-muted-foreground">Name: {session.user.name}</p>
    </div>
  );
}

export default function Dashboard() {
  return (
    <main className="hero-aura min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright scale-x-[-1]">
            <Play className="size-3 fill-current" />
          </span>
          Please select and option from the sidebar
        </div>
        <Suspense fallback={<Spinner className="size-8 block mx-auto" />}>
          <ClientData />
        </Suspense>
        <SignOutFormButton
          variant="outline"
          size="lg"
          className="btn-brand-outline"
        />
      </div>
    </main>
  );
}
