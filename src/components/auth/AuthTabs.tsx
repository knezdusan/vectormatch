import type { AuthPageProps } from "@/app/auth/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

export async function AuthTabs({ searchParams }: AuthPageProps) {
  const { tab } = await searchParams;
  const defaultTab = tab === "signup" ? "signup" : "signin";

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign In</TabsTrigger>
        <TabsTrigger value="signup">Sign Up</TabsTrigger>
      </TabsList>

      <TabsContent value="signin" className="mt-6">
        <SignInForm />
      </TabsContent>

      <TabsContent value="signup" className="mt-6">
        <SignUpForm />
      </TabsContent>
    </Tabs>
  );
}
