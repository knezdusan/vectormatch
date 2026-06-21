// SkillsSection — read-only display of extracted skills grouped by category
// src/components/onboarding/SkillsSection.tsx
//
// Renders all canonical_skills_detected from the LLM extraction, grouped by
// TAGS_BY_CATEGORY. In MVP this is display-only — the user cannot deactivate
// tags here (that's a post-MVP feature). The tags shown here are the pool from
// which the user picks 5 must_have_tags per persona in PersonaSection.

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CANONICAL_TAG_MAP, type TagCategory } from "@/lib/jobs/tech-tags";

const CATEGORY_LABELS: Record<TagCategory, string> = {
  language: "Languages",
  frontend: "Frontend",
  backend: "Backend",
  database: "Databases",
  devops: "DevOps & Cloud",
  library: "Libraries & Tools",
  mobile: "Mobile",
  methodology: "Methodologies",
};

const CATEGORY_ORDER: TagCategory[] = [
  "language",
  "frontend",
  "backend",
  "database",
  "devops",
  "library",
  "mobile",
  "methodology",
];

export function SkillsSection({
  canonicalSkills,
}: {
  canonicalSkills: string[];
}) {
  // Group the detected skills by their canonical category.
  const skillsByCategory = new Map<TagCategory, string[]>();
  for (const tag of canonicalSkills) {
    const canonical = CANONICAL_TAG_MAP.get(tag);
    const category = canonical?.category ?? "library";
    const list = skillsByCategory.get(category) ?? [];
    list.push(tag);
    skillsByCategory.set(category, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detected skills</CardTitle>
        <CardDescription>
          These are the skills we extracted from your CV, normalized to our
          canonical tag set. They form the pool you pick your 5 persona-defining
          tags from.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {skillsByCategory.size === 0 ? (
          <p className="text-sm text-muted-foreground">No skills detected.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {CATEGORY_ORDER.filter((cat) => skillsByCategory.has(cat)).map(
              (category) => (
                <div key={category} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {skillsByCategory.get(category)?.map((tag) => {
                      const canonical = CANONICAL_TAG_MAP.get(tag);
                      const isPersonaDefining =
                        canonical?.classification === "persona_defining";
                      return (
                        <Badge
                          key={tag}
                          variant={isPersonaDefining ? "default" : "secondary"}
                          title={
                            isPersonaDefining
                              ? "Persona-defining tag"
                              : "Supporting tag"
                          }
                        >
                          {canonical?.label ?? tag}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
