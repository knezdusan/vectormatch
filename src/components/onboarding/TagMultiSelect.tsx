"use client";

// TagMultiSelect — searchable multi-select for canonical tags
// src/components/onboarding/TagMultiSelect.tsx
//
// Used by the work-history editor to let users add or remove the canonical
// skills attached to a job entry. Tags are grouped by category and filtered
// by a search input.

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

type TagMultiSelectProps = {
  selectedTags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

export function TagMultiSelect({
  selectedTags,
  onChange,
  placeholder = "Search skills…",
}: TagMultiSelectProps) {
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags]);

  const toggleTag = (tag: string) => {
    onChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag],
    );
  };

  const filteredByCategory = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const map = new Map<TagCategory, string[]>();
    for (const [tag, meta] of CANONICAL_TAG_MAP) {
      if (selectedSet.has(tag)) continue;
      if (
        lowerSearch &&
        !tag.toLowerCase().includes(lowerSearch) &&
        !meta.label.toLowerCase().includes(lowerSearch)
      ) {
        continue;
      }
      const list = map.get(meta.category) ?? [];
      list.push(tag);
      map.set(meta.category, list);
    }
    return map;
  }, [search, selectedSet]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {selectedTags.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No skills selected.
          </span>
        ) : (
          selectedTags.map((tag) => {
            const meta = CANONICAL_TAG_MAP.get(tag);
            return (
              <Badge
                key={tag}
                variant="default"
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
                title="Click to remove"
              >
                {meta?.label ?? tag} ×
              </Badge>
            );
          })
        )}
      </div>

      <Input
        type="text"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="max-h-60 overflow-y-auto rounded-md border border-border-soft p-3">
        {CATEGORY_ORDER.filter((cat) => filteredByCategory.has(cat)).length ===
        0 ? (
          <p className="text-sm text-muted-foreground">No matching skills.</p>
        ) : (
          CATEGORY_ORDER.filter((cat) => filteredByCategory.has(cat)).map(
            (category) => (
              <div key={category} className="mb-4 last:mb-0">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  {CATEGORY_LABELS[category]}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {filteredByCategory.get(category)?.map((tag) => {
                    const meta = CANONICAL_TAG_MAP.get(tag);
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => toggleTag(tag)}
                      >
                        {meta?.label ?? tag}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
