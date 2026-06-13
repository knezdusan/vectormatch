"use client";

import {
  MoreHorizontal,
  Shield,
  ShieldOff,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  emailVerified?: boolean | null;
  createdAt?: Date | null;
}

interface AdminUsersTableProps {
  users: AdminUser[];
  currentUserId: string;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function UserStatusBadges({
  user,
  isCurrentUser,
}: {
  user: AdminUser;
  isCurrentUser: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      {user.emailVerified ? (
        <Badge
          variant="outline"
          className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        >
          Verified
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20"
        >
          Unverified
        </Badge>
      )}
      {isCurrentUser && (
        <Badge variant="secondary" className="text-xs">
          You
        </Badge>
      )}
      {user.banned && (
        <Badge variant="destructive" className="text-xs">
          Banned
        </Badge>
      )}
    </div>
  );
}

function UserActions({
  user,
  isCurrentUser,
}: {
  user: AdminUser;
  isCurrentUser: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleImpersonate = async () => {
    if (isCurrentUser) {
      toast.error("You cannot impersonate yourself");
      return;
    }
    setIsLoading(true);
    const { error } = await authClient.admin.impersonateUser({
      userId: user.id,
    });
    setIsLoading(false);
    if (error) {
      toast.error(error.message || "Failed to impersonate user");
    } else {
      toast.success("Impersonating user");
      window.location.reload();
    }
  };

  const handleBanToggle = async () => {
    setIsLoading(true);
    if (user.banned) {
      const { error } = await authClient.admin.unbanUser({
        userId: user.id,
      });
      setIsLoading(false);
      if (error) {
        toast.error(error.message || "Failed to unban user");
      } else {
        toast.success("User unbanned");
        window.location.reload();
      }
    } else {
      const { error } = await authClient.admin.banUser({
        userId: user.id,
      });
      setIsLoading(false);
      if (error) {
        toast.error(error.message || "Failed to ban user");
      } else {
        toast.success("User banned");
        window.location.reload();
      }
    }
  };

  const handleDelete = async () => {
    if (isCurrentUser) {
      toast.error("You cannot delete your own account from here");
      setDeleteOpen(false);
      return;
    }
    setIsLoading(true);
    const { error } = await authClient.admin.removeUser({
      userId: user.id,
    });
    setIsLoading(false);
    setDeleteOpen(false);
    if (error) {
      toast.error(error.message || "Failed to delete user");
    } else {
      toast.success("User deleted");
      window.location.reload();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isLoading}
            aria-label="Open menu"
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleImpersonate}
            disabled={isLoading || isCurrentUser}
          >
            <UserCheck className="size-4 mr-2" />
            Impersonate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleBanToggle}
            disabled={isLoading || isCurrentUser}
          >
            {user.banned ? (
              <>
                <ShieldOff className="size-4 mr-2" />
                Unban User
              </>
            ) : (
              <>
                <Shield className="size-4 mr-2" />
                Ban User
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            disabled={isLoading || isCurrentUser}
            variant="destructive"
          >
            <Trash2 className="size-4 mr-2" />
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              user account and remove all their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AdminUsersTable({
  users,
  currentUserId,
}: AdminUsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No users found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[40%]">User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId;
            return (
              <TableRow key={user.id} className="group">
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                    <UserStatusBadges
                      user={user}
                      isCurrentUser={isCurrentUser}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {user.role || "user"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(user.createdAt)}
                </TableCell>
                <TableCell>
                  <UserActions user={user} isCurrentUser={isCurrentUser} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
