import type { Metadata } from "next";
import Link from "next/link";
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
  title: "B2B Compliance — VectorMatch",
  description:
    "A practical guide to hiring international developers as independent contractors: W-8BEN forms, 0% US withholding tax, B2B invoicing, and procurement-aligned engagement models.",
  alternates: {
    canonical: `${SITE_URL}/compliance`,
  },
  openGraph: {
    title: "B2B Compliance — VectorMatch",
    description:
      "A practical guide to hiring international developers as independent contractors: W-8BEN forms, 0% US withholding tax, B2B invoicing, and procurement-aligned engagement models.",
    url: `${SITE_URL}/compliance`,
  },
};

const SECTIONS = [
  { id: "overview", title: "1. Overview" },
  { id: "why-b2b", title: "2. Why B2B Over Employment" },
  { id: "engagement-models", title: "3. Engagement Models" },
  { id: "w-8ben", title: "4. The W-8BEN Form" },
  { id: "withholding", title: "5. 0% US Withholding Tax" },
  { id: "payment", title: "6. Payment Methods" },
  { id: "procurement", title: "7. Procurement Alignment" },
  { id: "checklist", title: "8. Hiring Checklist" },
  { id: "misclassification", title: "9. Contractor vs. Employee" },
  { id: "disclaimer", title: "10. Legal Disclaimer" },
];

export default function CompliancePage() {
  return (
    <LegalLayout
      eyebrow="B2B Compliance"
      title="Hiring International Developers as Contractors"
      description="Everything a hiring company needs to engage an international developer as an independent contractor — from W-8BEN forms and 0% withholding tax to procurement-friendly invoicing and payment setup. This guide lowers the corporate friction of B2B hiring."
      lastUpdated="10 July 2026"
      sections={SECTIONS}
    >
      <LegalSectionHeading id="overview">1. Overview</LegalSectionHeading>
      <LegalP>
        When VectorMatch matches you with a developer in another country, the
        simplest and most cost-effective engagement model is often a{" "}
        <LegalStrong>
          business-to-business (B2B) contractor arrangement
        </LegalStrong>{" "}
        rather than traditional employment. This guide explains how it works,
        what forms are needed, and why procurement teams find it straightforward
        to approve.
      </LegalP>
      <LegalCallout title="The 30-second version">
        A foreign developer working from outside the US can be hired as an
        independent contractor with{" "}
        <LegalStrong>0% US tax withholding</LegalStrong>. You collect a one-page
        W-8BEN form, pay them via wire/Deel/Wise, and treat the engagement like
        any other vendor relationship. No payroll, no benefits administration,
        no local entity required.
      </LegalCallout>

      <LegalSectionHeading id="why-b2b">
        2. Why B2B Over Employment
      </LegalSectionHeading>
      <LegalP>
        Hiring a full-time employee in another country typically requires either
        setting up a local legal entity or using an Employer of Record (EOR)
        service like Deel or Remote.com. Both add cost, complexity, and
        administrative overhead. A B2B contractor arrangement avoids all of
        this:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>No local entity needed</LegalStrong> &mdash; you contract
          directly with the developer&rsquo;s sole proprietorship or LLC in
          their home country
        </LegalLi>
        <LegalLi>
          <LegalStrong>No payroll processing</LegalStrong> &mdash; the
          contractor invoices you, you pay the invoice, done
        </LegalLi>
        <LegalLi>
          <LegalStrong>No benefits administration</LegalStrong> &mdash; health
          insurance, pension, paid time off, and taxes are the
          contractor&rsquo;s responsibility
        </LegalLi>
        <LegalLi>
          <LegalStrong>No employment law compliance</LegalStrong> in the
          contractor&rsquo;s jurisdiction &mdash; the relationship is governed
          by the contract, not local labor law
        </LegalLi>
        <LegalLi>
          <LegalStrong>Lower total cost</LegalStrong> &mdash; no EOR markup
          (typically 15&ndash;25%), no employer payroll taxes, no benefits
          overhead
        </LegalLi>
        <LegalLi>
          <LegalStrong>Faster to set up</LegalStrong> &mdash; sign a contract,
          collect a W-8BEN, and start paying. No weeks-long EOR onboarding.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="engagement-models">
        3. Engagement Models
      </LegalSectionHeading>
      <LegalP>
        VectorMatch supports several compliance arrangements. The right one
        depends on the developer&rsquo;s country, business structure, and your
        company&rsquo;s preferences:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>B2B (Company-to-Company)</LegalStrong> &mdash; the
          developer operates through a registered entity (sole proprietorship,
          LLC, Ltd). You pay their company, they handle their own taxes. Common
          in Serbia, UK (Outside IR35), Poland, Estonia.
        </LegalLi>
        <LegalLi>
          <LegalStrong>
            W-8BEN (Foreign Solo Contractor for US Client)
          </LegalStrong>{" "}
          &mdash; the developer is an individual contractor outside the US. 0%
          US tax withholding, exempt from IRS 1099 reporting. The most common
          model for non-US developers working with US companies.
        </LegalLi>
        <LegalLi>
          <LegalStrong>1099 (US Resident Solo Contractor)</LegalStrong> &mdash;
          for US-based freelancers. Requires W-9 form and IRS 1099-NEC filing if
          payments exceed $600/year.
        </LegalLi>
        <LegalLi>
          <LegalStrong>
            IC Global (International Solo Contractor for non-US Client)
          </LegalStrong>{" "}
          &mdash; the developer contracts with a non-US company and files taxes
          locally in their home country.
        </LegalLi>
        <LegalLi>
          <LegalStrong>EOR (Employer of Record)</LegalStrong> &mdash; full-time
          employment via Deel, Remote, or similar. Higher cost but provides full
          employment benefits and compliance. Use when you want a long-term,
          exclusive relationship with employment protections.
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="w-8ben">4. The W-8BEN Form</LegalSectionHeading>
      <LegalP>
        <LegalStrong>Form W-8BEN</LegalStrong> (Certificate of Foreign Status of
        Beneficial Owner for United States Tax Withholding and Reporting) is the
        single most important document when hiring a non-US developer as a
        contractor. It is a one-page IRS form that:
      </LegalP>
      <LegalUl>
        <LegalLi>
          Confirms the contractor is <LegalStrong>not a US person</LegalStrong>
        </LegalLi>
        <LegalLi>
          Verifies their country of citizenship and tax residency
        </LegalLi>
        <LegalLi>
          Establishes that services are performed{" "}
          <LegalStrong>outside the United States</LegalStrong> (making the
          income foreign-source, not US-source)
        </LegalLi>
        <LegalLi>
          May claim benefits under a tax treaty between the contractor&rsquo;s
          country and the US (though most non-US contractors working abroad
          don&rsquo;t need a treaty &mdash; the foreign-source income rule
          already exempts them)
        </LegalLi>
      </LegalUl>
      <LegalSubHeading id="w-8ben-vs-w-8ben-e">
        4.1 W-8BEN vs. W-8BEN-E
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          <LegalStrong>W-8BEN</LegalStrong> &mdash; for foreign{" "}
          <LegalStrong>individuals</LegalStrong> (sole proprietors, freelancers)
        </LegalLi>
        <LegalLi>
          <LegalStrong>W-8BEN-E</LegalStrong> &mdash; for foreign{" "}
          <LegalStrong>entities</LegalStrong> (LLCs, corporations, limited
          companies). Use this when the developer operates through a registered
          business.
        </LegalLi>
      </LegalUl>
      <LegalSubHeading id="w-8ben-validity">
        4.2 Validity &amp; Retention
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          The form is valid until{" "}
          <LegalStrong>December 31 of the third year</LegalStrong> after signing
          (e.g., a form signed in March 2026 is valid through December 31, 2029)
        </LegalLi>
        <LegalLi>
          You do <LegalStrong>not</LegalStrong> send the form to the IRS &mdash;
          keep it in your records
        </LegalLi>
        <LegalLi>
          Retain the form for at least <LegalStrong>four years</LegalStrong>{" "}
          after the last tax year you relied on it
        </LegalLi>
        <LegalLi>
          Request a new form when the old one expires or when the
          contractor&rsquo;s circumstances change (new country, new entity type)
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="withholding">
        5. 0% US Withholding Tax
      </LegalSectionHeading>
      <LegalP>
        This is the key insight that makes international B2B hiring attractive:{" "}
        <LegalStrong>
          when a foreign contractor performs all their work outside the United
          States, the income is foreign-source and you are not required to
          withhold US income tax.
        </LegalStrong>
      </LegalP>
      <LegalP>Specifically:</LegalP>
      <LegalUl>
        <LegalLi>
          You are <LegalStrong>not required</LegalStrong> to withhold US income
          tax from payments to a foreign contractor working entirely abroad
        </LegalLi>
        <LegalLi>
          You are <LegalStrong>not required</LegalStrong> to file Form 1099-NEC
          for foreign contractors working abroad (unlike US contractors, where
          1099-NEC is required for payments over $600/year)
        </LegalLi>
        <LegalLi>
          The contractor handles their own tax obligations in their home country
        </LegalLi>
        <LegalLi>
          If you <LegalStrong>fail to collect</LegalStrong> a W-8BEN before
          paying, the IRS requires you to withhold{" "}
          <LegalStrong>30%</LegalStrong> of the payment as backup withholding
          &mdash; so always collect the form first
        </LegalLi>
      </LegalUl>
      <LegalCallout title="The critical exception">
        If the contractor is a{" "}
        <LegalStrong>US citizen or green card holder</LegalStrong> living
        abroad, they are still subject to US tax law regardless of where they
        live. In that case, collect a W-9 and file a 1099-NEC if payments exceed
        $600/year. If a foreign contractor performs work{" "}
        <LegalStrong>while physically present in the US</LegalStrong> for 90+
        days and earns $3,000+, different rules apply &mdash; consult a tax
        professional.
      </LegalCallout>

      <LegalSectionHeading id="payment">6. Payment Methods</LegalSectionHeading>
      <LegalP>
        Once the compliance paperwork is in place, getting money to an
        international contractor is straightforward. Common methods:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>Deel / Remote / Multiplier</LegalStrong> &mdash; global
          payroll platforms designed for international contractors. Handle
          currency conversion, compliance documentation, and payment delivery.
          Add a small fee per contractor but eliminate administrative overhead.
          Best for teams hiring multiple international contractors.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Wise (formerly TransferWise)</LegalStrong> &mdash;
          low-cost international transfers with mid-market exchange rates. The
          contractor receives funds in their local currency with minimal fees.
          Best for direct, one-off contractor relationships.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Direct wire transfer (SWIFT)</LegalStrong> &mdash;
          reliable but may carry fees on both ends and unfavorable exchange rate
          spreads. Best for larger, less frequent payments.
        </LegalLi>
        <LegalLi>
          <LegalStrong>Payoneer</LegalStrong> &mdash; popular with international
          freelancers, offers receiving accounts in multiple currencies.
        </LegalLi>
      </LegalUl>
      <LegalP>
        Always pay in the <LegalStrong>agreed currency</LegalStrong> and
        document the exchange rate at the time of payment for your accounting
        records. The contractor should invoice you in their preferred currency
        (commonly EUR or USD for international engagements).
      </LegalP>

      <LegalSectionHeading id="procurement">
        7. Procurement Alignment
      </LegalSectionHeading>
      <LegalP>
        One of the biggest barriers to hiring international contractors is
        internal procurement approval. Framing the engagement in standard
        corporate procurement terms makes it easy for finance and legal teams to
        say yes:
      </LegalP>
      <LegalSubHeading id="vendor-not-employee">
        7.1 Frame It as a Vendor Relationship
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          The developer is a <LegalStrong>software services vendor</LegalStrong>
          , not an employee &mdash; the same category as a design agency or
          consulting firm
        </LegalLi>
        <LegalLi>They invoice monthly like any other vendor</LegalLi>
        <LegalLi>
          The engagement is governed by a{" "}
          <LegalStrong>Statement of Work (SOW)</LegalStrong> or Master Services
          Agreement (MSA), not an employment contract
        </LegalLi>
        <LegalLi>
          No onboarding into HR systems, no benefits enrollment, no payroll
          setup
        </LegalLi>
      </LegalUl>
      <LegalSubHeading id="procurement-checklist">
        7.2 What Procurement Needs
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          Signed contractor agreement (MSA or SOW) with a{" "}
          <LegalStrong>permanent establishment disclaimer clause</LegalStrong>{" "}
          stating no PE is created in the contractor&rsquo;s country
        </LegalLi>
        <LegalLi>
          Completed W-8BEN or W-8BEN-E form (for US companies) or equivalent tax
          residency documentation
        </LegalLi>
        <LegalLi>
          The contractor&rsquo;s business registration or sole proprietorship
          documentation from their home country
        </LegalLi>
        <LegalLi>
          Invoices with the contractor&rsquo;s business name, address, tax ID,
          and payment terms
        </LegalLi>
        <LegalLi>
          Evidence that services are performed outside the US (the W-8BEN form
          itself serves as this documentation)
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="checklist">
        8. Hiring Checklist
      </LegalSectionHeading>
      <LegalP>
        A step-by-step checklist for engaging an international developer as a
        B2B contractor:
      </LegalP>
      <LegalUl>
        <LegalLi>
          <LegalStrong>1. Verify contractor classification</LegalStrong> &mdash;
          confirm the developer works with multiple clients, controls their own
          schedule, and uses their own tools (see Section 9)
        </LegalLi>
        <LegalLi>
          <LegalStrong>2. Sign a contractor agreement</LegalStrong> &mdash; MSA
          or SOW with a permanent establishment disclaimer clause
        </LegalLi>
        <LegalLi>
          <LegalStrong>
            3. Collect a W-8BEN (individual) or W-8BEN-E (entity)
          </LegalStrong>{" "}
          &mdash; before making the first payment
        </LegalLi>
        <LegalLi>
          <LegalStrong>4. Set up payment</LegalStrong> &mdash; via Deel, Wise,
          wire transfer, or Payoneer. Agree on currency and invoicing schedule.
        </LegalLi>
        <LegalLi>
          <LegalStrong>5. Agree on deliverables and milestones</LegalStrong>{" "}
          &mdash; define what success looks like and how progress is measured
        </LegalLi>
        <LegalLi>
          <LegalStrong>6. Maintain records</LegalStrong> &mdash; keep the signed
          agreement, W-8BEN, invoices, and payment records for at least 4 years
        </LegalLi>
        <LegalLi>
          <LegalStrong>7. Renew the W-8BEN</LegalStrong> every 3 years or when
          circumstances change
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="misclassification">
        9. Contractor vs. Employee Classification
      </LegalSectionHeading>
      <LegalP>
        The IRS and foreign tax authorities distinguish contractors from
        employees based on{" "}
        <LegalStrong>
          behavioral control, financial control, and the nature of the
          relationship
        </LegalStrong>
        . Getting this wrong can trigger misclassification penalties, back
        taxes, and benefits obligations.
      </LegalP>
      <LegalSubHeading id="legitimate-contractor-signs">
        9.1 Signs of a Legitimate Contractor Relationship
      </LegalSubHeading>
      <LegalUl>
        <LegalLi>
          They work for <LegalStrong>multiple clients</LegalStrong>, not just
          you
        </LegalLi>
        <LegalLi>
          They control their own <LegalStrong>schedule and methods</LegalStrong>
        </LegalLi>
        <LegalLi>
          They supply their own <LegalStrong>tools and equipment</LegalStrong>{" "}
          (laptop, software licenses, development environment)
        </LegalLi>
        <LegalLi>
          The relationship is{" "}
          <LegalStrong>project-based or fixed-term</LegalStrong>, not indefinite
        </LegalLi>
        <LegalLi>They don&rsquo;t receive employee benefits from you</LegalLi>
        <LegalLi>
          They send <LegalStrong>invoices</LegalStrong> rather than receiving a
          salary
        </LegalLi>
      </LegalUl>
      <LegalSubHeading id="pe-risk">
        9.2 Permanent Establishment Risk
      </LegalSubHeading>
      <LegalP>
        If your contractor&rsquo;s activities in their home country rise to a
        certain level, that country&rsquo;s tax authorities may treat you as
        having a taxable presence there (&ldquo;permanent establishment&rdquo;).
        To mitigate this risk:
      </LegalP>
      <LegalUl>
        <LegalLi>
          Ensure the contract explicitly states that" "
          <LegalStrong>no permanent establishment is created</LegalStrong>
        </LegalLi>
        <LegalLi>
          Don&rsquo;t grant the contractor authority to" "
          <LegalStrong>sign contracts</LegalStrong> on your behalf
        </LegalLi>
        <LegalLi>
          Don&rsquo;t let the contractor work" "
          <LegalStrong>exclusively</LegalStrong> for you over extended periods
        </LegalLi>
        <LegalLi>
          Use separate agreements for each project rather than one open-ended
          arrangement
        </LegalLi>
        <LegalLi>
          For long-term engagements, consult a local tax advisor in the
          contractor&rsquo;s country
        </LegalLi>
      </LegalUl>

      <LegalSectionHeading id="disclaimer">
        10. Legal Disclaimer
      </LegalSectionHeading>
      <LegalCallout title="Informational only — not legal or tax advice">
        <LegalP>
          This guide provides general information about international contractor
          engagement models. It is <LegalStrong>not</LegalStrong>" " legal, tax,
          or accounting advice. Tax laws vary by jurisdiction and change
          frequently. Always consult a qualified tax professional or
          international employment attorney before engaging a contractor in a
          specific country.
        </LegalP>
        <LegalP>
          VectorMatch is not responsible for any tax liabilities, legal
          disputes, compliance failures, or misclassification penalties arising
          from your use of this information. The" "
          <Link href="/terms">Terms of Service</Link> govern your use of the
          Platform, including this compliance resource.
        </LegalP>
      </LegalCallout>
      <LegalP>
        For questions about this guide, contact" "
        <a href="mailto:hello@vectormatch.dev">hello@vectormatch.dev</a>.
      </LegalP>
    </LegalLayout>
  );
}
