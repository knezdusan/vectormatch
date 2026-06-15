import { ArrowLeft, Users } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, requireRole } from "@/lib/auth";

export default async function AdminUsersPage() {
  const session = await requireRole("admin", "/dashboard");

  const { users } = await auth.api.listUsers({
    query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
    headers: await headers(),
  });

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-5xl mx-auto w-full">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Home
      </Link>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            <CardTitle>Users ({users.length})</CardTitle>
          </div>
          <CardDescription>
            Manage user accounts, roles, and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminUsersTable
            users={
              users as unknown as Array<{
                id: string;
                name: string;
                email: string;
                role?: string | null;
                banned?: boolean | null;
                emailVerified?: boolean | null;
                createdAt?: Date | null;
              }>
            }
            currentUserId={session.user.id}
          />
        </CardContent>
      </Card>
    </main>
  );
}
