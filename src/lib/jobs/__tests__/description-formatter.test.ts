import { formatDescriptionHtml } from "@/lib/jobs/description-formatter";

describe("formatDescriptionHtml", () => {
  it("extracts and formats a JSON-LD JobPosting description", () => {
    const rawJson = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Senior Laravel Engineer",
      description:
        "About us\n\n" +
        "At HelpBnk, we build infrastructure for a future where everyone has agency.\n \n" +
        "Our Culture\n\n" +
        "Ownership. We're small, so there's a lot of open ground.\n\n" +
        "What You’ll Do\n\n" +
        "Architect scalable Laravel applications.\n\n" +
        "Refactor and rebuild features.",
    });

    const html = formatDescriptionHtml({ rawJson });
    expect(html).toBeTruthy();
    expect(html).toContain("<h3>About us</h3>");
    expect(html).toContain("<p>At HelpBnk, we build infrastructure");
    expect(html).toContain("<h3>Our Culture</h3>");
    expect(html).toContain(
      "<p>Ownership. We&#39;re small, so there&#39;s a lot of open ground.</p>",
    );
    expect(html).toContain("<h3>What You’ll Do</h3>");
    expect(html).toContain("<p>Architect scalable Laravel applications.</p>");
    expect(html).toContain("<p>Refactor and rebuild features.</p>");
  });

  it("reformats collapsed normalizedText into headers and paragraphs", () => {
    const normalizedText =
      "About us At HelpBnk, we build. Our Culture Ownership is key. " +
      "Requirements 5+ years Laravel.";

    const html = formatDescriptionHtml({ normalizedText });
    expect(html).toBeTruthy();
    expect(html).toContain("<h3>About us</h3>");
    expect(html).toContain("<p>At HelpBnk, we build.</p>");
    expect(html).toContain("<h3>Our Culture</h3>");
    expect(html).toContain("<p>Ownership is key.</p>");
    expect(html).toContain("<h3>Requirements</h3>");
    expect(html).toContain("<p>5+ years Laravel.</p>");
  });

  it("converts bullet lists into <ul>", () => {
    const normalizedText = "- First item\n- Second item\n- Third item";
    const html = formatDescriptionHtml({ normalizedText });
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>First item</li>");
    expect(html).toContain("<li>Second item</li>");
    expect(html).toContain("<li>Third item</li>");
    expect(html).toContain("</ul>");
  });

  it("converts numbered lists into <ol>", () => {
    const normalizedText = "1. First item\n2. Second item\n3. Third item";
    const html = formatDescriptionHtml({ normalizedText });
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>First item</li>");
    expect(html).toContain("<li>Second item</li>");
    expect(html).toContain("<li>Third item</li>");
    expect(html).toContain("</ol>");
  });

  it("sanitizes HTML from Greenhouse-style rawJson", () => {
    const rawJson = JSON.stringify({
      title: "Frontend Engineer",
      content: "<p>We are <strong>hiring</strong> a frontend engineer.</p>",
    });

    const html = formatDescriptionHtml({ rawJson, atsSource: "greenhouse" });
    expect(html).toContain(
      "<p>We are <strong>hiring</strong> a frontend engineer.</p>",
    );
  });

  it("extracts SmartRecruiters sections with headings", () => {
    const rawJson = JSON.stringify({
      name: "Backend Engineer",
      jobAd: {
        sections: {
          jobDescription: { text: "<p>Build great APIs.</p>" },
          qualifications: { text: "<p>5 years experience.</p>" },
        },
      },
    });

    const html = formatDescriptionHtml({
      rawJson,
      atsSource: "smartrecruiters",
    });
    expect(html).toContain("<h3>Job Description</h3>");
    expect(html).toContain("<p>Build great APIs.</p>");
    expect(html).toContain("<h3>Qualifications</h3>");
    expect(html).toContain("<p>5 years experience.</p>");
  });

  it("falls back to normalizedText when rawJson has no usable description", () => {
    const rawJson = JSON.stringify({ title: "Only a title" });
    const normalizedText = "Requirements 3 years of React.";

    const html = formatDescriptionHtml({ rawJson, normalizedText });
    expect(html).toContain("<h3>Requirements</h3>");
    expect(html).toContain("<p>3 years of React.</p>");
  });

  it("extracts description from JSON-LD stored as normalizedText", () => {
    // Simulates the real larajobs case: the JSON has literal newlines inside
    // string values, making JSON.parse fail. The regex fallback should still
    // extract the description field.
    const normalizedText =
      '{"@context":"https://schema.org","@type":"JobPosting","title":"Senior Laravel Engineer","description":"About us\\n\\n' +
      "At HelpBnk, we build infrastructure.\n\n" +
      'Requirements\n\n5+ years Laravel.","datePosted":"2026-07-15"}';

    const html = formatDescriptionHtml({ normalizedText });
    expect(html).toBeTruthy();
    expect(html).toContain("<h3>About us</h3>");
    expect(html).toContain("<p>At HelpBnk, we build infrastructure.</p>");
    expect(html).toContain("<h3>Requirements</h3>");
    expect(html).toContain("<p>5+ years Laravel.</p>");
    // The JSON wrapper must NOT appear in the output
    expect(html).not.toContain("@context");
    expect(html).not.toContain("@type");
    expect(html).not.toContain("JobPosting");
  });

  it("returns null when no content is available", () => {
    expect(formatDescriptionHtml({})).toBeNull();
    expect(formatDescriptionHtml({ rawJson: "{}" })).toBeNull();
  });
});
