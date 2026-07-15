ALTER TYPE "public"."rejection_reason" ADD VALUE 'scope_text_restriction' BEFORE 'stack_mismatch';--> statement-breakpoint
ALTER TYPE "public"."rejection_reason" ADD VALUE 'non_development_role' BEFORE 'stack_mismatch';--> statement-breakpoint
ALTER TYPE "public"."rejection_reason" ADD VALUE 'management_role' BEFORE 'stack_mismatch';