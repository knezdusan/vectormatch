import { UserRound } from "lucide-react";
import { SignOutFormButton } from "@/components/auth/SignOutFormButton";
import { Button } from "@/components/ui/button";
import { getAuthSession } from "@/lib/auth";

export default async function Auth() {
  const authSession = await getAuthSession();

  return (
    <div className="items-center gap-3.5 flex">
      {authSession ? (
        <div className="flex items-center gap-3.5 justify-end w-full">
          <SignOutFormButton variant="outline" size="lg" />
          <Button variant="outline" size="lg" className="rounded-full">
            <a href="/dashboard">
              <UserRound />
            </a>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 justify-end w-full">
          <Button variant="outline" size="lg" className="text-muted-foreground">
            <a href="/auth?tab=signin">Log in</a>
          </Button>
          <Button asChild className="btn-brand btn-pill">
            <a href="/auth?tab=signup">Get Started</a>
          </Button>
        </div>
      )}
    </div>
  );
}
