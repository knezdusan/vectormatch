import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1>VectorMatch</h1>
      <Button variant="outline" asChild>
        <a href="https://google.com" target="_blank" rel="noopener noreferrer">
          Visit Google
        </a>
      </Button>
    </div>
  );
}
