CREATE TABLE "sent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resend_email_id" text,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"cc" text,
	"bcc" text,
	"subject" text,
	"html_body" text,
	"text_body" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"folder" text DEFAULT 'sent' NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "is_read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "folder" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "sent_emails_resend_email_id_idx" ON "sent_emails" USING btree ("resend_email_id");--> statement-breakpoint
CREATE INDEX "sent_emails_to_address_idx" ON "sent_emails" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "sent_emails_created_at_idx" ON "sent_emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sent_emails_folder_idx" ON "sent_emails" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "inbound_emails_folder_idx" ON "inbound_emails" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "inbound_emails_is_read_idx" ON "inbound_emails" USING btree ("is_read");