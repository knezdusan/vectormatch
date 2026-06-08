import { Suspense } from "react";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export type AuthPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export function generateMetadata() {
  return {
    title: "Sign In - VectorMatch",
    description: "Sign in to your VectorMatch account",
  };
}

export default async function Auth({ searchParams }: AuthPageProps) {
  return (
    <main className="hero-aura min-h-screen flex items-center justify-center bg-background pb-4 border-t border-border">
      <Card className="w-full max-w-md relative bottom-8">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Welcome to VectorMatch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Spinner className="mx-auto size-8" />}>
            <AuthTabs searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
