import { config } from "dotenv";
import { Resend } from "resend";

// Load environment variables from .env file
config();

// Load environment variables
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail =
  process.env.RESEND_FROM_EMAIL ?? "VectorMatch <onboarding@resend.dev>";

console.log("=== Email Configuration Diagnostic ===");
console.log("");

// Check if API key is set
if (!resendApiKey) {
  console.error("❌ RESEND_API_KEY is not set in environment variables");
  process.exit(1);
}

console.log("✅ RESEND_API_KEY is set");
console.log(`   Key starts with: ${resendApiKey.substring(0, 8)}...`);
console.log("");

// Initialize Resend client
const resend = new Resend(resendApiKey);

// Test email configuration
async function testEmailConfig() {
  console.log("=== Testing Resend API Connection ===");

  try {
    // Test with a simple API call to verify the key works
    const result = await resend.domains.list();
    console.log("✅ Resend API connection successful");

    // Access the domains data with proper type handling
    const domains = Array.isArray((result.data as { data?: unknown })?.data)
      ? (result.data as { data: unknown[] }).data
      : [];
    console.log(`   Found ${domains.length || 0} domain(s) configured`);

    if (domains.length > 0) {
      console.log("   Domains:");
      domains.forEach((domain) => {
        console.log(
          `   - ${(domain as { name?: string; region?: string }).name} (${(domain as { region?: string }).region || "N/A"})`,
        );
      });
    }
  } catch (error: unknown) {
    console.error("❌ Resend API connection failed:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    console.error(
      `   Status: ${(error as { statusCode?: number | null }).statusCode?.toString() || "Unknown"}`,
    );
    process.exit(1);
  }

  console.log("");
}

// Test sending a verification email
async function testSendEmail() {
  console.log("=== Testing Email Send ===");

  const testEmail =
    process.argv[2] ??
    process.env.TEST_EMAIL_RECIPIENT ??
    "stacionari@gmail.com";

  console.log(`Sending test email from: ${fromEmail}`);
  console.log(`Sending test email to:   ${testEmail}`);
  console.log("");

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: testEmail,
      subject: "Test Email - VectorMatch",
      html: "<p>This is a test email from VectorMatch. If you receive this, email sending is working correctly!</p>",
    });

    if (error) {
      console.error("❌ Email send failed:");
      console.error(`   Error: ${error.message}`);
      console.error(`   Name: ${(error as { name?: string }).name}`);
      console.error(
        `   Status: ${(error as { statusCode?: number | null }).statusCode?.toString() || "Unknown"}`,
      );
    } else {
      console.log("✅ Email send successful");
      console.log(`   Email ID: ${data?.id}`);
      console.log(`   Check your inbox at ${testEmail}`);
    }
  } catch (error: unknown) {
    console.error("❌ Email send failed with exception:");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
  }
}

// Run diagnostics
async function runDiagnostics() {
  await testEmailConfig();
  await testSendEmail();

  console.log("");
  console.log("=== Diagnostic Complete ===");
  console.log("");
  console.log("Next steps:");
  console.log("1. If API connection failed, check your RESEND_API_KEY");
  console.log(
    "2. If email send failed, check Resend dashboard for rate limits/domain issues",
  );
  console.log(
    "3. Check the recipient inbox: sender should be the RESEND_FROM_EMAIL address",
  );
  console.log(
    "4. In Gmail, use 'Show original' to confirm SPF, DKIM, and DMARC all pass",
  );
}

runDiagnostics().catch(console.error);
