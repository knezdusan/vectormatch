/**
 * Unit tests for Directive 30, Rulings 2.1 + 2.2 — Deterministic Title Blockers.
 *
 * Tests cover:
 *   - Platform-name blocker (persona-relative exceptions)
 *   - Role-family blocker (persona-relative exemptions)
 *   - Combined filtering of candidates
 *   - Edge cases (empty title, empty tags, multiple matches)
 */

import { describe, expect, it } from "vitest";

import {
  checkTitleBlockers,
  filterCandidatesByTitleBlockers,
} from "@/lib/jobs/title-blockers";

// =============================================================================
// PLATFORM-NAME BLOCKER (Ruling 2.1)
// =============================================================================

describe("Platform-name blocker (Ruling 2.1)", () => {
  const jsPersonaTags = [
    "typescript",
    "nextjs",
    "react",
    "nodejs",
    "prompt-engineering",
  ];
  const phpPersonaTags = ["php", "laravel", "mysql", "wordpress", "javascript"];

  it("rejects SharePoint for JS persona", () => {
    const result = checkTitleBlockers(
      "Senior SharePoint Developer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
    expect(result.blocker).toContain("SharePoint");
  });

  it("rejects Magento for JS persona", () => {
    const result = checkTitleBlockers(
      "Magento Backend Developer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
    expect(result.blocker).toContain("Magento");
  });

  it("rejects Salesforce for JS persona", () => {
    const result = checkTitleBlockers(
      "Salesforce Apex Developer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
    expect(result.blocker).toContain("Salesforce");
  });

  it("rejects ServiceNow for JS persona", () => {
    const result = checkTitleBlockers("ServiceNow Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("rejects Sitecore for JS persona", () => {
    const result = checkTitleBlockers("Sitecore Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("rejects AEM for JS persona", () => {
    const result = checkTitleBlockers("AEM Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
    expect(result.blocker).toContain("AEM");
  });

  it("rejects Webflow for JS persona", () => {
    const result = checkTitleBlockers(
      "Webflow Designer/Developer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("rejects .NET/C# for JS persona", () => {
    const result = checkTitleBlockers("Senior .NET Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
    expect(result.blocker).toContain(".NET/C#");
  });

  it("rejects C# for JS persona", () => {
    const result = checkTitleBlockers("C# Backend Engineer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("rejects Drupal for JS persona", () => {
    const result = checkTitleBlockers("Drupal Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  // Persona-relative exceptions

  it("allows WordPress for PHP persona (wordpress in must-have tags)", () => {
    const result = checkTitleBlockers("WordPress Developer", phpPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("allows Shopify for PHP persona (shopify exempt via... no, shopify not in tags)", () => {
    // Shopify is NOT in the PHP persona's must-have tags, so it should be blocked
    const result = checkTitleBlockers("Shopify Developer", phpPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("allows Shopify when persona has shopify tag", () => {
    const shopifyPersonaTags = [
      "shopify",
      "liquid",
      "javascript",
      "html",
      "css",
    ];
    const result = checkTitleBlockers("Shopify Developer", shopifyPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("allows .NET when persona has dotnet tag", () => {
    const dotnetPersonaTags = ["csharp", "dotnet", "aspnet", "sql"];
    const result = checkTitleBlockers(
      "Senior .NET Developer",
      dotnetPersonaTags,
    );
    expect(result.passes).toBe(true);
  });

  it("allows ASP.NET when persona has aspnet tag", () => {
    const dotnetPersonaTags = ["csharp", "dotnet", "aspnet", "sql"];
    const result = checkTitleBlockers(
      "ASP.NET Core Developer",
      dotnetPersonaTags,
    );
    expect(result.passes).toBe(true);
  });

  it("allows generic titles without platform names", () => {
    const result = checkTitleBlockers(
      "Senior Software Engineer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(true);
  });

  it("allows React Developer for JS persona", () => {
    const result = checkTitleBlockers("Senior React Developer", jsPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("allows Full Stack Developer for JS persona", () => {
    const result = checkTitleBlockers("Full Stack Developer", jsPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("handles empty title gracefully", () => {
    const result = checkTitleBlockers("", jsPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("handles null title gracefully", () => {
    const result = checkTitleBlockers(null as unknown as string, jsPersonaTags);
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// ROLE-FAMILY BLOCKER (Ruling 2.2)
// =============================================================================

describe("Role-family blocker (Ruling 2.2)", () => {
  const jsPersonaTags = [
    "typescript",
    "nextjs",
    "react",
    "nodejs",
    "prompt-engineering",
  ];
  const icSeniority = ["mid", "senior"];

  it("rejects Solutions Architect for IC persona", () => {
    const result = checkTitleBlockers(
      "Solutions Architect",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
    expect(result.blocker).toContain("Architect");
  });

  it("rejects Software Architect for IC persona", () => {
    const result = checkTitleBlockers(
      "Software Architect",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects DevOps Engineer for JS persona without DevOps tags", () => {
    const result = checkTitleBlockers(
      "DevOps Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
    expect(result.blocker).toContain("DevOps");
  });

  it("rejects SRE for JS persona without DevOps tags", () => {
    const result = checkTitleBlockers(
      "Site Reliability Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects Platform Engineer for JS persona", () => {
    const result = checkTitleBlockers(
      "Platform Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects Data Engineer for JS persona", () => {
    const result = checkTitleBlockers(
      "Data Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects ML Engineer for frontend persona without ML tags", () => {
    const frontendTags = [
      "typescript",
      "react",
      "nextjs",
      "graphql",
      "tailwindcss",
    ];
    const result = checkTitleBlockers("ML Engineer", frontendTags, icSeniority);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("allows ML Engineer for AI persona with prompt-engineering tag", () => {
    const result = checkTitleBlockers(
      "ML Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(true);
  });

  it("rejects Mobile Developer for JS persona", () => {
    const result = checkTitleBlockers(
      "Mobile Developer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects iOS Developer for JS persona", () => {
    const result = checkTitleBlockers(
      "iOS Developer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects React Native Developer for JS persona without mobile tags", () => {
    const result = checkTitleBlockers(
      "React Native Developer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects QA Engineer for JS persona", () => {
    const result = checkTitleBlockers(
      "QA Engineer",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects SDET for JS persona", () => {
    const result = checkTitleBlockers("SDET", jsPersonaTags, icSeniority);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  it("rejects Engineering Manager for IC persona", () => {
    const result = checkTitleBlockers(
      "Engineering Manager",
      jsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
    expect(result.blocker).toContain("Engineering Manager");
  });

  it("rejects Tech Lead for IC persona", () => {
    const result = checkTitleBlockers("Tech Lead", jsPersonaTags, icSeniority);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("role_family");
  });

  // Persona-relative exemptions

  it("allows DevOps when persona has docker tag", () => {
    const devopsPersonaTags = [
      "docker",
      "kubernetes",
      "terraform",
      "aws",
      "python",
    ];
    const result = checkTitleBlockers(
      "DevOps Engineer",
      devopsPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(true);
  });

  it("allows ML Engineer when persona has prompt-engineering tag", () => {
    const aiPersonaTags = [
      "python",
      "prompt-engineering",
      "langchain",
      "typescript",
    ];
    const result = checkTitleBlockers(
      "ML Engineer",
      aiPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(true);
  });

  it("allows React Native when persona has react-native tag", () => {
    const mobilePersonaTags = ["react-native", "typescript", "javascript"];
    const result = checkTitleBlockers(
      "React Native Developer",
      mobilePersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(true);
  });

  it("allows Engineering Manager when persona has manager seniority", () => {
    const result = checkTitleBlockers("Engineering Manager", jsPersonaTags, [
      "manager",
      "lead",
    ]);
    expect(result.passes).toBe(true);
  });

  it("allows Tech Lead when persona has lead seniority", () => {
    const result = checkTitleBlockers("Tech Lead", jsPersonaTags, [
      "lead",
      "senior",
    ]);
    expect(result.passes).toBe(true);
  });

  it("allows QA when persona has qa tag", () => {
    const qaPersonaTags = ["qa", "testing", "playwright", "typescript"];
    const result = checkTitleBlockers(
      "QA Engineer",
      qaPersonaTags,
      icSeniority,
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// COMBINED / EDGE CASES
// =============================================================================

describe("Combined and edge cases", () => {
  const jsPersonaTags = [
    "typescript",
    "nextjs",
    "react",
    "nodejs",
    "prompt-engineering",
  ];

  it("platform blocker takes precedence over role-family", () => {
    // "SharePoint DevOps Engineer" — both match, platform wins (checked first)
    const result = checkTitleBlockers(
      "SharePoint DevOps Engineer",
      jsPersonaTags,
    );
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });

  it("allows AI Engineer for JS persona with prompt-engineering tag", () => {
    const result = checkTitleBlockers("AI Engineer", jsPersonaTags);
    expect(result.passes).toBe(true);
  });

  it("rejects SAP Developer for JS persona", () => {
    const result = checkTitleBlockers("SAP ABAP Developer", jsPersonaTags);
    expect(result.passes).toBe(false);
    expect(result.blockerType).toBe("platform");
  });
});

// =============================================================================
// BATCH FILTERING
// =============================================================================

describe("filterCandidatesByTitleBlockers", () => {
  const title = "Senior SharePoint Developer";

  const candidates = [
    {
      personaId: "p1",
      mustHaveTags: [
        "typescript",
        "nextjs",
        "react",
        "nodejs",
        "prompt-engineering",
      ],
      seniorityLevels: ["senior"],
    },
    {
      personaId: "p2",
      mustHaveTags: ["sharepoint", "csharp", "dotnet"],
      seniorityLevels: ["senior"],
    },
    {
      personaId: "p3",
      mustHaveTags: ["php", "laravel", "mysql", "wordpress", "javascript"],
      seniorityLevels: ["senior"],
    },
  ];

  it("filters out candidates that fail blockers, keeps those that pass", () => {
    const { passed, rejected } = filterCandidatesByTitleBlockers(
      title,
      candidates,
    );

    // p2 has "sharepoint" tag → passes
    // p1 and p3 don't have sharepoint → rejected
    expect(passed).toHaveLength(1);
    expect(passed[0].personaId).toBe("p2");

    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => r.candidate.personaId).sort()).toEqual([
      "p1",
      "p3",
    ]);
    expect(rejected[0].blockerType).toBe("platform");
  });

  it("returns all candidates when title has no platform/role signals", () => {
    const { passed, rejected } = filterCandidatesByTitleBlockers(
      "Senior React Developer",
      candidates,
    );
    expect(passed).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("handles empty candidates array", () => {
    const { passed, rejected } = filterCandidatesByTitleBlockers(title, []);
    expect(passed).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("handles candidates without seniorityLevels", () => {
    const candidatesNoSeniority = [
      {
        personaId: "p1",
        mustHaveTags: ["typescript", "react"],
      },
    ];
    const { passed, rejected } = filterCandidatesByTitleBlockers(
      "Engineering Manager",
      candidatesNoSeniority,
    );
    // No seniority → management role is blocked
    expect(passed).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].blockerType).toBe("role_family");
  });
});
