import { Play } from "lucide-react";

export default function Dashboard() {
  return (
    <main className="hero-aura flex min-h-[calc(100svh-4rem)] items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Welcome to Dashboard</h1>
        <div className="flex items-center justify-center gap-2">
          <span className="grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright scale-x-[-1]">
            <Play className="size-3 fill-current" />
          </span>
          <p>Please select an option from the sidebar</p>
        </div>
      </div>
    </main>
  );
}
