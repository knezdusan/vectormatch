import {
  classifyStackFamily,
  getStackFamilies,
  isQARole,
  isStackDisjoint,
  PROCESS_NOISE_TAGS,
  stackOverlapScore,
  stripProcessNoise,
} from "@/lib/jobs/stack-families";

describe("Stack Families — classifyStackFamily", () => {
  it("classifies JS/TS tags as js family", () => {
    expect(classifyStackFamily(["typescript", "react", "nextjs"])).toBe("js");
  });

  it("classifies PHP tags as php family", () => {
    expect(classifyStackFamily(["php", "laravel", "mysql"])).toBe("php");
  });

  it("classifies Ruby tags as ruby family", () => {
    expect(classifyStackFamily(["ruby", "rails"])).toBe("ruby");
  });

  it("classifies .NET tags as dotnet family", () => {
    expect(classifyStackFamily(["csharp", "dotnet", "aspnet"])).toBe("dotnet");
  });

  it("classifies Java tags as java family", () => {
    expect(classifyStackFamily(["java", "spring-boot"])).toBe("java");
  });

  it("classifies Python tags as python family", () => {
    expect(classifyStackFamily(["python", "django"])).toBe("python");
  });

  it("returns null for empty tags", () => {
    expect(classifyStackFamily([])).toBeNull();
  });

  it("returns null for process-noise-only tags", () => {
    expect(classifyStackFamily(["docker", "ci-cd", "aws"])).toBeNull();
  });

  it("picks the family with most matches for mixed tags", () => {
    // 2 JS tags + 1 Python tag → js
    expect(classifyStackFamily(["react", "typescript", "python"])).toBe("js");
  });
});

describe("Stack Families — isStackDisjoint", () => {
  it("returns false when persona is JS and job has JS tags", () => {
    expect(isStackDisjoint(["typescript", "react"], ["react", "nodejs"])).toBe(false);
  });

  it("returns true when persona is JS and job is Ruby-only", () => {
    expect(isStackDisjoint(["typescript", "react"], ["ruby", "rails"])).toBe(true);
  });

  it("returns true when persona is JS and job is .NET-only", () => {
    expect(isStackDisjoint(["typescript", "react"], ["csharp", "dotnet"])).toBe(true);
  });

  it("returns true when persona is PHP and job is Java-only", () => {
    expect(isStackDisjoint(["php", "laravel"], ["java", "spring-boot"])).toBe(true);
  });

  it("returns false when job has tags from multiple families including persona's", () => {
    // .NET/React job — has both csharp AND react → NOT disjoint from JS persona
    expect(isStackDisjoint(["typescript", "react"], ["csharp", "react"])).toBe(false);
  });

  it("returns false when persona has no identifiable family", () => {
    expect(isStackDisjoint(["docker", "ci-cd"], ["ruby", "rails"])).toBe(false);
  });
});

describe("Stack Families — isQARole", () => {
  it("detects 'QA Automation Engineer' in title", () => {
    expect(isQARole("QA Automation Engineer SR", ["playwright", "cypress"])).toBe(true);
  });

  it("detects 'SDET' in title", () => {
    expect(isQARole("Senior SDET", ["selenium", "java"])).toBe(true);
  });

  it("detects 'Test Engineer' in title", () => {
    expect(isQARole("Software Test Engineer", ["playwright"])).toBe(true);
  });

  it("does NOT flag 'Software Engineer' title", () => {
    expect(isQARole("Senior Software Engineer", ["react", "typescript"])).toBe(false);
  });

  it("does NOT flag 'Full Stack Developer' title", () => {
    expect(isQARole("Full Stack Developer", ["react", "nodejs"])).toBe(false);
  });

  it("detects QA role from tags alone (3+ QA tags, no dev title)", () => {
    expect(isQARole("Engineering Role", ["selenium", "cypress", "playwright", "k6"])).toBe(true);
  });
});

describe("Stack Families — stripProcessNoise", () => {
  it("removes docker, ci-cd, aws", () => {
    const result = stripProcessNoise(["react", "docker", "ci-cd", "aws", "typescript"]);
    expect(result).toEqual(["react", "typescript"]);
  });

  it("keeps stack tags", () => {
    const result = stripProcessNoise(["php", "laravel", "javascript"]);
    expect(result).toEqual(["php", "laravel", "javascript"]);
  });

  it("returns empty for noise-only tags", () => {
    const result = stripProcessNoise(["docker", "ci-cd", "git"]);
    expect(result).toEqual([]);
  });
});

describe("Stack Families — stackOverlapScore", () => {
  it("counts only stack tags, not process noise", () => {
    // Persona: [typescript, react, nextjs]
    // Job: [react, docker, ci-cd, aws]
    // Stack overlap: 1 (react) — not 4 (react + docker + ci-cd + aws)
    expect(stackOverlapScore(["typescript", "react", "nextjs"], ["react", "docker", "ci-cd", "aws"])).toBe(1);
  });

  it("returns 0 for disjoint stacks", () => {
    expect(stackOverlapScore(["php", "laravel"], ["ruby", "rails"])).toBe(0);
  });

  it("returns full overlap for matching stacks", () => {
    expect(stackOverlapScore(["typescript", "react"], ["typescript", "react", "nextjs"])).toBe(2);
  });
});

describe("Stack Families — getStackFamilies", () => {
  it("returns multiple families for mixed-stack job", () => {
    const families = getStackFamilies(["csharp", "react", "dotnet"]);
    expect(families).toContain("js");
    expect(families).toContain("dotnet");
  });

  it("returns single family for pure-stack job", () => {
    expect(getStackFamilies(["php", "laravel", "wordpress"])).toEqual(["php"]);
  });

  it("returns empty for process-noise-only", () => {
    expect(getStackFamilies(["docker", "ci-cd"])).toEqual([]);
  });
});
