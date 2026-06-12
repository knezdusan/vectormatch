import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { requireRole } from "@/lib/auth";

// fallow-ignore-next-line
export async function AdminData() {
  await requireRole("admin", "/dashboard");
  return <div>Admin</div>;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Spinner className="size-8 block mx-auto" />}>
      <AdminData />
    </Suspense>
  );
}
