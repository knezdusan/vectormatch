import type { Metadata } from "next";
import {
  LegalCallout,
  LegalLayout,
  LegalLi,
  LegalP,
  LegalSectionHeading,
  LegalStrong,
  LegalSubHeading,
  LegalUl,
} from "@/components/public/LegalLayout";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — VectorMatch",
  description:
    "How VectorMatch collects, processes, and protects your personal data, including CV information, AI-powered job matching, and your GDPR rights.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy — VectorMatch",
    description:
      "How VectorMatch collects, processes, and protects your personal data, including CV information, AI-powered job matching, and your GDPR rights.",
    url: `${SITE_URL}/privacy`,
  },
};

const SECTIONS = [
  { id: "overview", title: "1. Overview" },
  { id: "controller", title: "2. Data Controller" },
  { id: "data-we-collect", title: "3. Data We Collect" },
  { id: "legal-basis", title: "4. Legal Basis for Processing" },
  { id: "ai-processing", title: "5. AI & Automated Processing" },
  { id: "how-we-use", title: "6. How We Use Your Data" },
  { id: "data-retention", title: "7. Data Retention" },
  { id: "data-sharing", title: "8. Data Sharing & Sub-Processors" },
  { id: "international-transfers", title: "9. International Transfers" },
  { id: "cookies", title: "10. Cookies & Tracking" },
  { id: "your-rights", title: "11. Your GDPR Rights" },
  { id: "security", title: "12. Security Measures" },
  { id: "children", title: "13. Children's Privacy" },
  { id: "changes", title: "14. Changes to This Policy" },
  { id: "contact", title: "15. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      description="Your privacy is foundational to VectorMatch. This policy explains what personal data we collect, why we process it, how AI is involved, and the rights you have under the GDPR and other applicable laws."
      lastUpdated="10 July 2026"
      sections={SECTIONS}
    >
      <LegalSectionHeading id="overview">1. Overview</LegalSectionHeading>
      <LegalP>
        VectorMatch (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the
        Platform&rdquo;) is an AI-powered job-matching service that connects web
        developers with relevant job opportunities sourced from public Applicant
        Tracking Systems (ATS) and remote-first job boards. To provide this
        service, we process personal data including your curriculum vitae,
        professional experience, technical skills, and account credentials.
      </LegalP>
      <LegalP>
        This Privacy Policy describes how we collect, use, store, share, and
        protect your personal data in accordance with the{" "}
        <LegalStrong>General Data Protection Regulation (GDPR)</LegalStrong> (EU
        2016/679), the UK Data Protection Act 2018, and other applicable data
        protection laws.
      </LegalP>
      <LegalCallout title="Not a recruiter or employer">
        VectorMatch is a <LegalStrong>user-driven tool</LegalStrong> that acts
        on your behalf to discover and match publicly available job postings. We
        are not an employer, recruitment agency, or staffing firm. We do not
        make employment decisions and we do not share your data with employers
        without your explicit action.
      </LegalCallout>

      <LegalSectionHeading id="controller">
        2. Data Controller
      </LegalSectionHeading>
      <LegalP>
        VectorMatch is the <LegalStrong>data controller</LegalStrong>{" "}
        responsible for your personal data within the meaning of Article 4(7)
        GDPR. We determine the purposes and means of processing your data as
        described in this policy.
      </LegalP>
      <LegalP>
        For data protection inquiries, you can reach our Data Protection Officer
        at <a href="mailto:privacy@vectormatch.dev">privacy@vectormatch.dev</a>.
      </LegalP>

      <LegalSectionHeading id="data-we-collect">
        3. Data We Collect
      </LegalSectionHeading>
      <LegalSubHeading id="account-data">3.1 Account Data</LegalSubHeading>
      <LegalP>
        When you register, we collect the information necessary to create and
        secure your account:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Email address</LegalStrong> (used as your unique
          identifier)
        </LegalLi>
        <LegalLi>
          <LegalStrong>Password</LegalStrong> (stored as a bcrypt hash — we
          never see the plaintext)
        </LegalLi>
        <LegalLi>
          <LegalStrong>OAuth profile data</LegalStrong> (name, email, avatar
          URL) if you sign in via Google or GitHub
        </LegalLi>
        <LegalLi>
          <LegalStrong>Session tokens</LegalStrong> for authentication
          management
        </LegalLi>
      </LegalUl>

      <LegalSubHeading id="cv-and-profile">
        3.2 CV & Professional Profile Data
      </LegalSubHeading>
      <LegalP>
        When you upload your CV (PDF), we process the following data extracted
        from it:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Employment history</LegalStrong> — job titles, company
          names, start/end dates, responsibilities
        </LegalLi>
        <LegalLi>
          <LegalStrong>Technical skills</LegalStrong> — programming languages,
          frameworks, tools, mapped against our canonical tag dictionary
        </LegalLi>
        <LegalLi>
          <LegalStrong>Education</LegalStrong> — degrees, institutions,
          graduation years
        </LegalLi>
        <LegalLi>
          <LegalStrong>Inferred seniority level</LegalStrong> — derived from the
          chronological overlap-merge of your work history
        </LegalLi>
        <LegalLi>
          <LegalStrong>Persona embeddings</LegalStrong> — numerical vector
          representations (1536-dimensional floats) generated from your skill
          profile for semantic similarity matching
        </LegalLi>
      </LegalUl>
      <LegalP>
        You also provide <LegalStrong>work preferences</LegalStrong> directly:
        country of residence, ability to work US hours, assignment types
        (full-time, part-time, contract), modalities (remote, hybrid, on-site),
        and preferred compliance arrangements (W-2, B2B, 1099, W-8BEN, EOR,
        international contractor).
      </LegalP>

      <LegalSubHeading id="usage-data">
        3.3 Usage & Technical Data
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          IP address, browser type, device information (collected automatically
          via Cloudflare edge and server logs)
        </LegalLi>
        <LegalLi>
          Match interactions — which jobs you view, approve, or reject
        </LegalLi>
        <LegalLi>
          Pitch emails you generate and the recipient addresses you enter
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="legal-basis">
        4. Legal Basis for Processing
      </LegalSectionHeading>
      <LegalP>
        Under Article 6 GDPR, we rely on the following legal bases:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Performance of a contract (Art. 6(1)(b))</LegalStrong> —
          processing your CV, profile, and preferences to provide the
          job-matching service you requested
        </LegalLi>
        <LegalLi>
          <LegalStrong>Consent (Art. 6(1)(a))</LegalStrong> — for optional
          features like OAuth sign-in, marketing communications, and any
          processing that goes beyond what is necessary for the core service
        </LegalLi>
        <LegalLi>
          <LegalStrong>Legitimate interests (Art. 6(1)(f))</LegalStrong> — for
          security monitoring, fraud prevention, platform analytics, and
          improving the matching algorithm. These interests are balanced against
          your rights and never override your fundamental privacy expectations
        </LegalLi>
        <LegalLi>
          <LegalStrong>Legal obligation (Art. 6(1)(c))</LegalStrong> — where we
          are required to retain records for tax or legal compliance
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="ai-processing">
        5. AI & Automated Processing
      </LegalSectionHeading>
      <LegalP>
        VectorMatch uses artificial intelligence in several ways. We are
        transparent about each use so you can exercise your right to meaningful
        information about the logic involved (Art. 13(2)(f) GDPR).
      </LegalP>
      <LegalSubHeading id="cv-extraction">
        5.1 CV Extraction & Skill Mapping
      </LegalSubHeading>
      <LegalP>
        Your uploaded CV is parsed client-side in your browser using{" "}
        <LegalStrong>pdfjs-dist</LegalStrong>. The extracted text is then sent
        to <LegalStrong>OpenAI GPT-4o</LegalStrong> via the Vercel AI SDK, which
        applies a Chain-of-Thought overlap-merge algorithm to extract structured
        employment history, map skills against our canonical tag dictionary, and
        propose 1&ndash;2 initial personas. This processing is necessary to
        provide the core matching service.
      </LegalP>
      <LegalSubHeading id="vector-embeddings">
        5.2 Vector Embeddings for Semantic Matching
      </LegalSubHeading>
      <LegalP>
        We generate a 1536-dimensional numerical embedding of your persona using{" "}
        <LegalStrong>OpenAI text-embedding-3-small</LegalStrong>. This embedding
        is a mathematical representation of your skill profile and contains no
        human-readable personal data. It is used for cosine similarity matching
        against job postings.
      </LegalP>
      <LegalSubHeading id="gate-3-llm">
        5.3 LLM Job Evaluation (Gate 3)
      </LegalSubHeading>
      <LegalP>
        For each candidate job match, an LLM (GPT-4o or GPT-4o-mini) evaluates
        the fit between your persona and the job posting. The LLM receives your
        skill tags, seniority level, work preferences, and country information
        &mdash; <LegalStrong>not</LegalStrong> your raw CV text, name, or
        contact details. The LLM produces a verdict (approve/reject), confidence
        score, and reasoning.
      </LegalP>
      <LegalCallout title="No automated decisions with legal effect">
        The AI matching process does not produce decisions that produce legal
        effects concerning you (Art. 22 GDPR). It recommends job opportunities
        &mdash; you decide whether to pursue them. No employer sees your data
        unless you explicitly choose to apply or send a pitch.
      </LegalCallout>

      <LegalSectionHeading id="how-we-use">
        6. How We Use Your Data
      </LegalSectionHeading>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Provide the matching service</LegalStrong> &mdash; parse
          your CV, generate embeddings, match you against job postings, and
          display results in your dashboard
        </LegalLi>
        <LegalLi>
          <LegalStrong>Generate pitch emails</LegalStrong> &mdash; draft
          personalized cold-outreach templates referencing the matched
          job&rsquo;s tech stack and context
        </LegalLi>
        <LegalLi>
          <LegalStrong>Improve matching quality</LegalStrong> &mdash; calibrate
          thresholds, tune LLM prompts, and analyze aggregate match outcomes
        </LegalLi>
        <LegalLi>
          <LegalStrong>Account security</LegalStrong> &mdash; authenticate
          sessions, detect abuse, and enforce rate limits
        </LegalLi>
        <LegalLi>
          <LegalStrong>Communicate with you</LegalStrong> &mdash; service
          notifications, password resets, and product updates (only with consent
          where required)
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="data-retention">
        7. Data Retention
      </LegalSectionHeading>
      <LegalP>
        We retain your personal data only as long as necessary for the purposes
        described in this policy:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Account &amp; profile data</LegalStrong> &mdash; retained
          for the lifetime of your account. You can request deletion at any time
          (see Section 11).
        </LegalLi>
        <LegalLi>
          <LegalStrong>CV uploads</LegalStrong> &mdash; the latest CV is
          retained while your account is active. Orphaned uploads (from
          incomplete onboarding) are automatically purged by a scheduled job.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Match data</LegalStrong> &mdash; approved and rejected
          matches are retained for 90 days, then archived/deleted.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Job postings</LegalStrong> &mdash; public job data is
          retained for 60 days after the posting is last seen, then marked
          stale. Jobs older than 90 days are hard-deleted.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Server logs</LegalStrong> &mdash; retained for up to 30
          days for security and debugging purposes.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="data-sharing">
        8. Data Sharing &amp; Sub-Processors
      </LegalSectionHeading>
      <LegalP>
        We do <LegalStrong>not sell</LegalStrong> your personal data. We share
        data only with the following sub-processors who help us operate the
        Platform. All sub-processors are bound by data processing agreements
        (DPAs) consistent with Article 28 GDPR.
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>OpenAI</LegalStrong> (United States) &mdash; LLM
          inference (GPT-4o, GPT-4o-mini) and embedding generation
          (text-embedding-3-small). Receives CV text for parsing and skill
          tags/preferences for matching. OpenAI does not train on your data via
          our API usage.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Neon (PostgreSQL)</LegalStrong> (Frankfurt,
          aws-eu-central-1) &mdash; primary database hosting with pgvector
          extension for embedding storage and similarity search
        </LegalLi>
        <LegalLi>
          <LegalStrong>Cloudflare</LegalStrong> &mdash; edge protection, WAF,
          rate limiting, and DNS. Processes IP addresses and request metadata at
          the edge.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Resend</LegalStrong> &mdash; transactional email delivery
          (password resets, service notifications)
        </LegalLi>
        <LegalLi>
          <LegalStrong>Hetzner Cloud</LegalStrong> (Helsinki, eu-central)
          &mdash; application server hosting via Coolify
        </LegalLi>
        <LegalLi>
          <LegalStrong>Google / GitHub</LegalStrong> &mdash; OAuth identity
          providers (only if you choose to sign in with these services)
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="international-transfers">
        9. International Data Transfers
      </LegalSectionHeading>
      <LegalP>
        Your data is primarily processed within the European Union (Neon
        Postgres in Frankfurt, application servers in Helsinki). However, some
        sub-processors operate outside the EU:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>OpenAI</LegalStrong> processes API inputs in the United
          States. We rely on Standard Contractual Clauses (SCCs) and
          OpenAI&rsquo;s GDPR compliance commitments. We send only the minimum
          data necessary (CV text for parsing, anonymized skill tags for
          matching) and never your full contact details.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Cloudflare</LegalStrong> operates globally at the edge.
          The Data Processing Addendum (DPA) and SCCs apply.
        </LegalLi>
      </LegalUl>
      <LegalP>
        We monitor developments in EU&ndash;US data transfer frameworks
        (including the EU&ndash;US Data Privacy Framework) and update our
        safeguards accordingly.
      </LegalP>

      <LegalSectionHeading id="cookies">
        10. Cookies &amp; Tracking
      </LegalSectionHeading>
      <LegalP>
        VectorMatch uses a minimal set of cookies and local storage:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Authentication session cookie</LegalStrong> &mdash;
          essential for keeping you logged in. No third-party tracking.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Theme preference</LegalStrong> &mdash; stored in local
          storage to remember your dark/light mode choice.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Cloudflare analytics</LegalStrong> &mdash;
          privacy-preserving, cookie-free analytics that do not track individual
          users across sessions.
        </LegalLi>
      </LegalUl>
      <LegalP>
        We do <LegalStrong>not</LegalStrong> use advertising cookies, cross-site
        tracking pixels, or third-party analytics that profile individual users.
      </LegalP>

      <LegalSectionHeading id="your-rights">
        11. Your GDPR Rights
      </LegalSectionHeading>
      <LegalP>
        Under the GDPR, you have the following rights regarding your personal
        data:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Right of access (Art. 15)</LegalStrong> &mdash; request a
          copy of all personal data we hold about you
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to rectification (Art. 16)</LegalStrong> &mdash;
          correct inaccurate or incomplete data. You can edit your profile
          directly in the dashboard at any time.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to erasure (Art. 17)</LegalStrong> &mdash; request
          deletion of your account and all associated data
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to restrict processing (Art. 18)</LegalStrong>
          &mdash; limit how we process your data while a request is being
          resolved
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to data portability (Art. 20)</LegalStrong>
          &mdash; receive your data in a structured, machine-readable format
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to object (Art. 21)</LegalStrong> &mdash; object to
          processing based on legitimate interests
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to withdraw consent (Art. 7(3))</LegalStrong>
          &mdash; withdraw consent for optional processing at any time without
          affecting the lawfulness of prior processing
        </LegalLi>
        <LegalLi>
          <LegalStrong>Right to lodge a complaint (Art. 77)</LegalStrong>
          &mdash; complain to your local supervisory authority. We encourage you
          to contact us first, but you are not required to do so.
        </LegalLi>
      </LegalUl>
      <LegalP>
        To exercise any of these rights, email{" "}
        <a href="mailto:privacy@vectormatch.dev">privacy@vectormatch.dev</a>. We
        respond within <LegalStrong>30 days</LegalStrong> (typically much
        faster). We may ask for verification of your identity to protect against
        unauthorized requests.
      </LegalP>

      <LegalSectionHeading id="security">
        12. Security Measures
      </LegalSectionHeading>
      <LegalP>
        We implement industry-standard security measures to protect your
        personal data:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Encryption in transit</LegalStrong> &mdash; all
          connections use TLS 1.3 via Cloudflare edge
        </LegalLi>
        <LegalLi>
          <LegalStrong>Password hashing</LegalStrong> &mdash; bcrypt with
          adaptive cost; plaintext passwords are never stored or logged
        </LegalLi>
        <LegalLi>
          <LegalStrong>Database security</LegalStrong> &mdash; Neon Postgres
          with network isolation, encrypted connections, and role-based access
          control
        </LegalLi>
        <LegalLi>
          <LegalStrong>Rate limiting</LegalStrong> &mdash; Cloudflare WAF rate
          limits on authentication and high-cost API endpoints to prevent
          brute-force attacks
        </LegalLi>
        <LegalLi>
          <LegalStrong>Secret management</LegalStrong> &mdash; API keys and
          credentials stored as environment variables, never committed to source
          control
        </LegalLi>
        <LegalLi>
          <LegalStrong>Least-privilege access</LegalStrong> &mdash; only the
          application server has database access; no direct human access to
          production data except for verified incident response
        </LegalLi>
      </LegalUl>
      <LegalP>
        No system is 100% secure. If a data breach occurs that is likely to
        result in a risk to your rights and freedoms, we will notify the
        relevant supervisory authority within 72 hours and inform you directly
        if the risk is high (Arts. 33&ndash;34 GDPR).
      </LegalP>

      <LegalSectionHeading id="children">
        13. Children&rsquo;s Privacy
      </LegalSectionHeading>
      <LegalP>
        VectorMatch is intended for professionals seeking employment
        opportunities. The Platform is not directed at children under 16, and we
        do not knowingly collect personal data from anyone under 16. If you
        believe we have collected data from a minor, please contact us and we
        will promptly delete it.
      </LegalP>

      <LegalSectionHeading id="changes">
        14. Changes to This Policy
      </LegalSectionHeading>
      <LegalP>
        We may update this Privacy Policy from time to time to reflect changes
        in our practices, legal requirements, or operational needs. We will
        update the &ldquo;Last updated&rdquo; date at the top of this page and
        notify you of material changes via email or in-app notification. We
        encourage you to review this policy periodically.
      </LegalP>

      <LegalSectionHeading id="contact">15. Contact</LegalSectionHeading>
      <LegalP>
        If you have any questions about this Privacy Policy or how we handle
        your personal data, please contact us:
      </LegalP>
      <LegalUl>
        <LegalLi>
          Email:{" "}
          <a href="mailto:privacy@vectormatch.dev">privacy@vectormatch.dev</a>
        </LegalLi>
        <LegalLi>
          General inquiries:{" "}
          <a href="mailto:hello@vectormatch.dev">hello@vectormatch.dev</a>
        </LegalLi>
      </LegalUl>
      <LegalP>
        You also have the right to lodge a complaint with your local data
        protection supervisory authority.
      </LegalP>
    </LegalLayout>
  );
}
