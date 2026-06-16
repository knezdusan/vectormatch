import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CTAProps {
  title?: string;
  description?: string;
  buttonText?: string;
  href?: string;
}

export function CTA({
  title = "Find ATS jobs matching your exact skillset.",
  description = "Upload your CV and let our AI match engine rank your relevance score instantly.",
  buttonText = "Start Matching Free",
  href = "/signup?ref=blog-cta",
}: CTAProps) {
  return (
    <div className="my-10 rounded-2xl border border-primary/30 bg-linear-to-br from-primary/10 to-accent/5 p-6 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild className="btn-brand shrink-0">
          <Link href={href}>
            {buttonText}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
