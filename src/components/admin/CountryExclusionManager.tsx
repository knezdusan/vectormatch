"use client";

// CountryExclusionManager — admin UI for managing excluded countries
// src/components/admin/CountryExclusionManager.tsx
//
// Renders a searchable multi-select for adding/removing countries from the
// exclusion list. The excluded countries are fetched server-side and passed
// as props. Add/remove actions call server actions and revalidate the page.

import { Globe, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  addExcludedCountryAction,
  removeExcludedCountryAction,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COUNTRY_OPTIONS } from "@/lib/jobs/country-list";

interface ExcludedCountry {
  countryCode: string;
  countryName: string;
  excludedAt: Date | string;
  excludedBy: string | null;
}

interface CountryExclusionManagerProps {
  excludedCountries: ExcludedCountry[];
}

export function CountryExclusionManager({
  excludedCountries,
}: CountryExclusionManagerProps) {
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const excludedSet = useMemo(
    () => new Set(excludedCountries.map((c) => c.countryCode.toUpperCase())),
    [excludedCountries],
  );

  const availableCountries = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return COUNTRY_OPTIONS.filter(
      (c) =>
        !excludedSet.has(c.code) &&
        (lowerSearch === "" ||
          c.name.toLowerCase().includes(lowerSearch) ||
          c.code.toLowerCase().includes(lowerSearch)),
    );
  }, [search, excludedSet]);

  const handleAdd = (code: string) => {
    setError(null);
    startTransition(async () => {
      const res = await addExcludedCountryAction(code);
      if (!res.success) setError(res.error ?? "Failed to add country");
    });
  };

  const handleRemove = (code: string) => {
    setError(null);
    startTransition(async () => {
      const res = await removeExcludedCountryAction(code);
      if (!res.success) setError(res.error ?? "Failed to remove country");
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-5 text-muted-foreground" />
          <CardTitle className="text-base">Country Exclusions</CardTitle>
        </div>
        <CardDescription>
          Jobs located in or sourced from these countries are hard-blocked
          before entering the matching pipeline. Changes take effect on the next
          ingestion run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Currently excluded countries */}
        <div className="flex flex-wrap gap-1.5">
          {excludedCountries.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No countries excluded.
            </span>
          ) : (
            excludedCountries.map((c) => (
              <Badge
                key={c.countryCode}
                variant="default"
                className="gap-1 cursor-pointer"
                onClick={() => !isPending && handleRemove(c.countryCode)}
                title="Click to remove"
              >
                {c.countryName} ({c.countryCode})
                <X className="size-3" />
              </Badge>
            ))
          )}
        </div>

        {/* Search input */}
        <Input
          type="text"
          placeholder="Search countries to exclude…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Available countries */}
        <div className="max-h-48 overflow-y-auto rounded-md border border-border-soft p-3">
          {availableCountries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search ? "No matching countries." : "All countries excluded."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availableCountries.map((c) => (
                <Badge
                  key={c.code}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => !isPending && handleAdd(c.code)}
                >
                  {c.name} ({c.code})
                </Badge>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {isPending && (
          <p className="text-xs text-muted-foreground">Updating…</p>
        )}
      </CardContent>
    </Card>
  );
}
