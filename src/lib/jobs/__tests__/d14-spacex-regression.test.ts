import { describe, expect, it } from "vitest";
import { extractRemoteScope } from "@/lib/jobs/remote-scope-extractor";

describe("D14 SpaceX regression — worldwide product-scope vs job-scope", () => {
  it("SpaceX: remote + 'Bastrop, TX' + 'worldwide' (product-scope) → NOT global", async () => {
    const spacexText =
      "SpaceX was founded under a belief that a future where humanity is out exploring the stars is fundamentally more exciting. " +
      "SpaceX is leveraging our experience building rockets and spacecraft to deploy Starlink, " +
      "the world's most advanced broadband internet satellite constellation, providing worldwide internet connectivity. " +
      "ANTENNA ENGINEER (STARLINK) — SpaceX is leveraging its experience in building rockets and spacecraft.";

    const result = await extractRemoteScope(
      spacexText,
      "remote",
      "greenhouse",
      "Bastrop, TX",
      undefined,
      true, // deterministicOnly
    );

    // The "worldwide" in the JD refers to satellite coverage, not job scope.
    // With a specific US city location, this should NOT be global.
    expect(result.remoteScope).not.toBe("global");
  });

  it("Ashby recall: remote + 'London' + 'work from anywhere' → global (ALWAYS_GLOBAL_OVERRIDE)", async () => {
    const ashbyText =
      "We are a remote-first company. You can work from anywhere in the world. " +
      "We have team members across 20+ countries.";

    const result = await extractRemoteScope(
      ashbyText,
      "remote",
      "ashby",
      "London, UK",
      undefined,
      true,
    );

    // ALWAYS_GLOBAL_OVERRIDE patterns override specific locations.
    expect(result.remoteScope).toBe("global");
  });

  it("Genuinely global: remote + 'Remote' location + 'worldwide' → global", async () => {
    const globalText =
      "We are looking for a software engineer to join our distributed team. " +
      "This is a worldwide remote position.";

    const result = await extractRemoteScope(
      globalText,
      "remote",
      "greenhouse",
      "Remote",
      undefined,
      true,
    );

    expect(result.remoteScope).toBe("global");
  });

  it("Null workplace + specific city → onsite (Step 1f guard still works)", async () => {
    const result = await extractRemoteScope(
      "Some job text here about software engineering at our office.",
      null,
      "greenhouse",
      "San Francisco, CA",
      undefined,
      true,
    );

    expect(result.remoteScope).toBe("onsite");
  });

  it("SpaceX: remote + 'Redmond, WA' + 'worldwide' → NOT global", async () => {
    const spacexText =
      "SpaceX was founded to make humanity multiplanetary. " +
      "Starlink provides worldwide internet connectivity via satellite. " +
      "ELECTRICAL HARDWARE ENGINEER, SATELLITES (STARLINK).";

    const result = await extractRemoteScope(
      spacexText,
      "remote",
      "greenhouse",
      "Redmond, WA",
      undefined,
      true,
    );

    expect(result.remoteScope).not.toBe("global");
  });
});
