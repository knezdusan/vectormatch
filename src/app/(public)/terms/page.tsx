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
  title: "Terms of Service — VectorMatch",
  description:
    "The terms governing your use of VectorMatch, including our role as a user-driven job intelligence tool, acceptable use, indemnification, and limitation of liability.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  openGraph: {
    title: "Terms of Service — VectorMatch",
    description:
      "The terms governing your use of VectorMatch, including our role as a user-driven job intelligence tool, acceptable use, indemnification, and limitation of liability.",
    url: `${SITE_URL}/terms`,
  },
};

const SECTIONS = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "definition", title: "2. What VectorMatch Is" },
  { id: "user-driven", title: "3. User-Driven Job Intelligence Tool" },
  { id: "accounts", title: "4. Accounts & Authentication" },
  { id: "acceptable-use", title: "5. Acceptable Use" },
  { id: "cv-accuracy", title: "6. CV Accuracy & User Responsibility" },
  { id: "public-data", title: "7. Public Data Disclaimer" },
  { id: "pitches", title: "8. Outbound Pitches & Communications" },
  { id: "compliance", title: "9. B2B Compliance Resources" },
  { id: "intellectual-property", title: "10. Intellectual Property" },
  { id: "disclaimer", title: "11. Disclaimer of Warranties" },
  { id: "liability", title: "12. Limitation of Liability" },
  { id: "indemnification", title: "13. Indemnification" },
  { id: "termination", title: "14. Termination" },
  { id: "governing-law", title: "15. Governing Law & Disputes" },
  { id: "changes", title: "16. Changes to These Terms" },
  { id: "contact", title: "17. Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms govern your use of VectorMatch. They define our role as a user-driven job intelligence tool, your responsibilities, and the legal boundaries that protect both you and the Platform."
      lastUpdated="10 July 2026"
      sections={SECTIONS}
    >
      <LegalSectionHeading id="acceptance">
        1. Acceptance of Terms
      </LegalSectionHeading>
      <LegalP>
        By creating an account, uploading your CV, or otherwise using
        VectorMatch (the &ldquo;Platform&rdquo;), you agree to be bound by these
        Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these
        Terms, you must not use the Platform.
      </LegalP>
      <LegalP>
        These Terms form a legally binding agreement between you
        (&ldquo;you&rdquo;, &ldquo;User&rdquo;) and VectorMatch
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). If you are using the Platform on
        behalf of an entity, you represent that you have authority to bind that
        entity.
      </LegalP>

      <LegalSectionHeading id="definition">
        2. What VectorMatch Is
      </LegalSectionHeading>
      <LegalP>
        VectorMatch is an AI-powered job-matching service for web developers. It
        analyzes your CV, extracts your technical skills and experience,
        generates semantic embeddings, and matches you against job postings
        sourced from public Applicant Tracking Systems (ATS) and remote-first
        job boards. The Platform also generates personalized cold-outreach email
        templates to help you pitch directly to hiring managers.
      </LegalP>
      <LegalCallout title="What VectorMatch is NOT">
        <LegalUl>
          <LegalLi>
            <LegalStrong>Not an employer or recruiter.</LegalStrong> We do not
            hire, we do not make hiring decisions, and we are not a staffing
            agency.
          </LegalLi>
          <LegalLi>
            <LegalStrong>Not a job board.</LegalStrong> We do not host job
            postings ourselves &mdash; we discover and match postings that
            already exist publicly on third-party ATS platforms.
          </LegalLi>
          <LegalLi>
            <LegalStrong>Not a guarantee of employment.</LegalStrong> We provide
            tools and recommendations. Outcomes depend on your skills, the
            market, and the employers you choose to engage with.
          </LegalLi>
        </LegalUl>
      </LegalCallout>

      <LegalSectionHeading id="user-driven">
        3. User-Driven Job Intelligence Tool
      </LegalSectionHeading>
      <LegalP>
        VectorMatch operates as a{" "}
        <LegalStrong>user-driven automated agent</LegalStrong>. This means:
      </LegalP>
      <LegalUl>
        <LegalLi>
          The Platform acts <LegalStrong>on your behalf</LegalStrong> when
          reading publicly accessible job data from ATS platforms, job boards,
          and company career pages. You authorize the Platform to access this
          public data for the purpose of finding matches for your profile.
        </LegalLi>
        <LegalLi>
          The Platform reads only <LegalStrong>publicly visible</LegalStrong>{" "}
          data &mdash; job postings that are accessible without authentication
          on the source platforms. We do not access private, gated, or
          login-protected content.
        </LegalLi>
        <LegalLi>
          You acknowledge that the Platform has{" "}
          <LegalStrong>no affiliation</LegalStrong> with the third-party ATS
          platforms (Greenhouse, Lever, Ashby, Workday, etc.) or job boards
          (Himalayas, NoFluffJobs, RemoteOK, Remotive, WeWorkRemotely,
          Arbeitnow) it reads from. We do not represent them, and they do not
          endorse us.
        </LegalLi>
        <LegalLi>
          You are solely responsible for any outreach you send using the
          Platform&rsquo;s pitch generation tools. The Platform drafts
          templates; <LegalStrong>you</LegalStrong> decide whether to send them.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="accounts">
        4. Accounts &amp; Authentication
      </LegalSectionHeading>
      <LegalP>
        You must provide accurate and complete information when creating your
        account. You are responsible for maintaining the security of your
        account credentials and for all activity that occurs under your account.
      </LegalP>
      <LegalP>
        We offer authentication via email/password and OAuth (Google, GitHub).
        You may close your account at any time by contacting us. We reserve the
        right to suspend or terminate accounts that violate these Terms or
        applicable law.
      </LegalP>

      <LegalSectionHeading id="acceptable-use">
        5. Acceptable Use
      </LegalSectionHeading>
      <LegalP>You agree not to:</LegalP>
      <LegalUl>
        <LegalLi>
          Upload a CV that contains false, misleading, or fraudulent information
          about your experience or qualifications
        </LegalLi>
        <LegalLi>
          Use the Platform to scrape, harvest, or redistribute job postings for
          commercial purposes beyond your personal job search
        </LegalLi>
        <LegalLi>
          Send unsolicited mass emails or spam using the pitch generation tools
        </LegalLi>
        <LegalLi>
          Attempt to reverse-engineer, decompile, or otherwise extract the
          Platform&rsquo;s source code, algorithms, or proprietary data
        </LegalLi>
        <LegalLi>
          Use automated scripts, bots, or crawlers to access the Platform
          outside of the provided interface
        </LegalLi>
        <LegalLi>
          Use the Platform in any way that violates applicable laws, including
          employment discrimination laws, data protection laws, or anti-spam
          regulations
        </LegalLi>
        <LegalLi>
          Impersonate another person or misrepresent your affiliation with a
          company or organization
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="cv-accuracy">
        6. CV Accuracy &amp; User Responsibility
      </LegalSectionHeading>
      <LegalP>
        You are <LegalStrong>solely responsible</LegalStrong> for the accuracy
        and truthfulness of the information in the CV you upload. The Platform
        extracts and structures data from your CV using AI, but it does not
        verify the accuracy of your claims.
      </LegalP>
      <LegalP>You acknowledge that:</LegalP>
      <LegalUl>
        <LegalLi>
          Any pitch email generated by the Platform is based on the information
          you provided. If that information is inaccurate, the pitch will be
          inaccurate.
        </LegalLi>
        <LegalLi>
          Employers may verify the claims in your CV independently. You are
          responsible for any consequences of misrepresentation.
        </LegalLi>
        <LegalLi>
          The Platform&rsquo;s AI may occasionally misinterpret or misclassify
          information from your CV. You should review your extracted profile in
          the dashboard and correct any errors before relying on match results.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="public-data">
        7. Public Data Disclaimer
      </LegalSectionHeading>
      <LegalP>
        All job postings matched and displayed by the Platform are derived from{" "}
        <LegalStrong>publicly visible employer data feeds</LegalStrong> on
        third-party ATS platforms and job boards. We formally declare:
      </LegalP>
      <LegalUl>
        <LegalLi>
          We make <LegalStrong>no guarantee</LegalStrong> of uninterrupted
          access to any third-party platform. ATS platforms may change their
          APIs, rate limits, or data structures at any time without notice.
        </LegalLi>
        <LegalLi>
          We have <LegalStrong>no affiliation</LegalStrong> with any ATS
          platform, job board, or employer whose data appears on the Platform.
        </LegalLi>
        <LegalLi>
          Job postings may be{" "}
          <LegalStrong>stale, expired, or removed</LegalStrong> by the time you
          view them. We display the last seen date and mark stale postings, but
          we cannot guarantee that a posting is still active.
        </LegalLi>
        <LegalLi>
          Job descriptions, requirements, and compensation details are provided
          by the employer and may contain errors. We do not verify or endorse
          the accuracy of third-party job content.
        </LegalLi>
        <LegalLi>
          The Platform may cease to source from a particular ATS or job board if
          that platform blocks access, changes its terms, or becomes
          unavailable. This does not constitute a breach of these Terms.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="pitches">
        8. Outbound Pitches &amp; Communications
      </LegalSectionHeading>
      <LegalP>
        The Platform generates personalized cold-outreach email templates
        (&ldquo;Minute Zero pitches&rdquo;) based on your profile and the
        matched job. You are solely responsible for:
      </LegalP>
      <LegalUl>
        <LegalLi>Deciding whether to send a pitch and to whom</LegalLi>
        <LegalLi>
          The accuracy of any claims made in the pitch (which are derived from
          your CV)
        </LegalLi>
        <LegalLi>
          Compliance with anti-spam laws (CAN-SPAM, GDPR, ePrivacy Directive)
          applicable to your outreach
        </LegalLi>
        <LegalLi>
          Any consequences of contacting a third party, including being blocked,
          ignored, or reported
        </LegalLi>
      </LegalUl>
      <LegalP>
        The Platform does not send emails on your behalf. It generates drafts
        that you review and send through your own email client.
      </LegalP>

      <LegalSectionHeading id="compliance">
        9. B2B Compliance Resources
      </LegalSectionHeading>
      <LegalP>
        The Platform provides B2B compliance resources, including guidance on
        W-8BEN forms, independent contractor arrangements, and international
        payment methods. These resources are{" "}
        <LegalStrong>informational only</LegalStrong> and do not constitute
        legal, tax, or accounting advice.
      </LegalP>
      <LegalP>
        You should consult a qualified professional before entering into any
        contractor or employment arrangement. We are not responsible for any tax
        liabilities, legal disputes, or compliance failures arising from your
        use of these resources.
      </LegalP>

      <LegalSectionHeading id="intellectual-property">
        10. Intellectual Property
      </LegalSectionHeading>
      <LegalSubHeading id="our-ip">10.1 Platform IP</LegalSubHeading>
      <LegalP>
        The Platform, including its software, algorithms, design, matching
        engine, and brand, is owned by VectorMatch and protected by intellectual
        property laws. These Terms do not grant you any right to use the
        Platform&rsquo;s trademarks, logos, or proprietary technology except as
        necessary to use the service.
      </LegalP>
      <LegalSubHeading id="your-ip">10.2 Your Content</LegalSubHeading>
      <LegalP>
        You retain ownership of your CV, profile data, and any content you
        create using the Platform. By uploading your CV, you grant us a limited
        license to process it for the purpose of providing the matching service,
        generating embeddings, and producing pitch drafts as described in our
        Privacy Policy.
      </LegalP>
      <LegalSubHeading id="third-party-ip">
        10.3 Third-Party Content
      </LegalSubHeading>
      <LegalP>
        Job postings displayed on the Platform are the property of the
        respective employers and ATS platforms. We display them for your
        personal job search and do not claim ownership of third-party content.
      </LegalP>

      <LegalSectionHeading id="disclaimer">
        11. Disclaimer of Warranties
      </LegalSectionHeading>
      <LegalP>
        The Platform is provided <LegalStrong>&ldquo;as is&rdquo;</LegalStrong>{" "}
        and <LegalStrong>&ldquo;as available&rdquo;</LegalStrong> without
        warranties of any kind, whether express or implied. We do not warrant
        that:
      </LegalP>
      <LegalUl>
        <LegalLi>
          The Platform will be uninterrupted, error-free, or secure
        </LegalLi>
        <LegalLi>
          The job matches will be accurate, relevant, or lead to employment
        </LegalLi>
        <LegalLi>
          The AI extraction and matching will be free from errors or bias
        </LegalLi>
        <LegalLi>
          Third-party ATS platforms will remain accessible or continue to
          provide data
        </LegalLi>
      </LegalUl>
      <LegalP>You use the Platform at your own risk.</LegalP>

      <LegalSectionHeading id="liability">
        12. Limitation of Liability
      </LegalSectionHeading>
      <LegalP>
        To the maximum extent permitted by law, VectorMatch shall not be liable
        for any indirect, incidental, special, consequential, or punitive
        damages, including loss of profits, data, or goodwill, arising from your
        use of (or inability to use) the Platform.
      </LegalP>
      <LegalP>
        Our total aggregate liability for all claims arising from these Terms
        shall not exceed the amount you have paid us in the 12 months preceding
        the claim, or <LegalStrong>&euro;100</LegalStrong> if you have not paid
        us anything (e.g., during the free tier).
      </LegalP>
      <LegalP>
        This limitation does not apply to liability that cannot be excluded
        under applicable law (e.g., gross negligence, willful misconduct, or
        mandatory consumer protection provisions).
      </LegalP>

      <LegalSectionHeading id="indemnification">
        13. Indemnification
      </LegalSectionHeading>
      <LegalP>
        You agree to <LegalStrong>indemnify and hold harmless</LegalStrong>{" "}
        VectorMatch, its officers, employees, and affiliates from any claims,
        damages, losses, or expenses (including reasonable legal fees) arising
        from:
      </LegalP>
      <LegalUl>
        <LegalLi>The inaccuracy of information in your CV or profile</LegalLi>
        <LegalLi>
          Your use of the Platform in violation of these Terms or applicable law
        </LegalLi>
        <LegalLi>
          Outbound pitches or communications you send to third parties
        </LegalLi>
        <LegalLi>
          Any misrepresentation of your qualifications, identity, or affiliation
        </LegalLi>
        <LegalLi>
          Any breach of your obligations regarding CV accuracy and application
          outcomes
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="termination">
        14. Termination
      </LegalSectionHeading>
      <LegalP>
        You may terminate your account at any time by contacting us. Upon
        termination, we will delete your personal data in accordance with our
        Privacy Policy retention schedule.
      </LegalP>
      <LegalP>
        We may suspend or terminate your access to the Platform at any time,
        with or without cause, including if you violate these Terms. Upon
        termination, all licenses granted to you under these Terms cease
        immediately.
      </LegalP>

      <LegalSectionHeading id="governing-law">
        15. Governing Law &amp; Disputes
      </LegalSectionHeading>
      <LegalP>
        These Terms are governed by the laws of the{" "}
        <LegalStrong>European Union</LegalStrong> and the jurisdiction in which
        VectorMatch is established. Any disputes arising from these Terms shall
        be resolved in the competent courts of that jurisdiction, unless
        mandatory consumer protection law requires otherwise.
      </LegalP>
      <LegalP>
        Before initiating litigation, we encourage both parties to attempt
        good-faith resolution through direct communication. You may also use an
        alternative dispute resolution (ADR) procedure where available.
      </LegalP>

      <LegalSectionHeading id="changes">
        16. Changes to These Terms
      </LegalSectionHeading>
      <LegalP>
        We may update these Terms from time to time. We will notify you of
        material changes via email or in-app notification at least 14 days
        before they take effect. If you continue using the Platform after the
        effective date, you are deemed to have accepted the updated Terms.
      </LegalP>
      <LegalP>
        If you do not agree to the updated Terms, you may terminate your account
        as described in Section 14.
      </LegalP>

      <LegalSectionHeading id="contact">17. Contact</LegalSectionHeading>
      <LegalP>
        If you have questions about these Terms, please contact us:
      </LegalP>
      <LegalUl>
        <LegalLi>
          Email:{" "}
          <a href="mailto:legal@vectormatch.dev">legal@vectormatch.dev</a>
        </LegalLi>
        <LegalLi>
          General inquiries:{" "}
          <a href="mailto:hello@vectormatch.dev">hello@vectormatch.dev</a>
        </LegalLi>
      </LegalUl>
    </LegalLayout>
  );
}
