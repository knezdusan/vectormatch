CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resend_email_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"message_id" text,
	"html_body" text,
	"text_body" text,
	"headers" text,
	"attachment_count" text DEFAULT '0',
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_resend_email_id_unique" UNIQUE("resend_email_id")
);
--> statement-breakpoint
CREATE INDEX "inbound_emails_resend_email_id_idx" ON "inbound_emails" USING btree ("resend_email_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_to_address_idx" ON "inbound_emails" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "inbound_emails_created_at_idx" ON "inbound_emails" USING btree ("created_at");
