import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

type AuthPageProps = {
  searchParams: Promise<{ tab?: string; jobId?: string }>;
};

export async function AuthTabs({ searchParams }: AuthPageProps) {
  const { tab, jobId } = await searchParams;
  const defaultTab = tab === "signup" ? "signup" : "signin";

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign In</TabsTrigger>
        <TabsTrigger value="signup">Sign Up</TabsTrigger>
      </TabsList>

      <TabsContent value="signin" className="mt-6">
        <SignInForm pendingJobId={jobId} />
      </TabsContent>

      <TabsContent value="signup" className="mt-6">
        <SignUpForm pendingJobId={jobId} />
      </TabsContent>
    </Tabs>
  );
}
