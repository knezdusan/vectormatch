import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { ProfileCard } from "@/components/account/ProfileCard";
import { SecurityCard } from "@/components/account/SecurityCard";
import { getAuthSession, hasCredentialAccount } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getAuthSession();
  if (!session) return null;

  const hasPassword = await hasCredentialAccount(session.user.id);

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold">Account</h1>
      <ProfileCard initialName={session.user.name || ""} />
      {hasPassword && <SecurityCard />}
      <DeleteAccountCard />
    </main>
  );
}
