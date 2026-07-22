CREATE TYPE "public"."opportunity_brief_acknowledgement_status" AS ENUM('not_requested', 'pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_brief_status" AS ENUM('submitted', 'researching', 'brief_ready', 'contacted', 'invited_to_join', 'converted', 'rejected');--> statement-breakpoint
CREATE TABLE "opportunity_brief_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_type" "discovery_candidate_type" NOT NULL,
	"profile_url" text NOT NULL,
	"normalized_profile_url" text NOT NULL,
	"email" text,
	"normalized_email" text,
	"phone_number" text,
	"normalized_phone_number" text,
	"open_to_text" text,
	"source" text,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_candidate_id" uuid,
	"status" "opportunity_brief_status" DEFAULT 'submitted' NOT NULL,
	"admin_notes" text,
	"acknowledgement_status" "opportunity_brief_acknowledgement_status" DEFAULT 'not_requested' NOT NULL,
	"acknowledgement_email" text,
	"acknowledgement_error" text,
	"acknowledgement_sent_at" timestamp with time zone,
	"submission_count" integer DEFAULT 1 NOT NULL,
	"last_submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_brief_requests_participant_profile_unique" UNIQUE("participant_type","normalized_profile_url"),
	CONSTRAINT "opportunity_brief_requests_contact_check" CHECK ("opportunity_brief_requests"."normalized_email" IS NOT NULL OR "opportunity_brief_requests"."normalized_phone_number" IS NOT NULL),
	CONSTRAINT "opportunity_brief_requests_submission_count_check" CHECK ("opportunity_brief_requests"."submission_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_brief_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_hash" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunity_brief_requests" ADD CONSTRAINT "opportunity_brief_requests_linked_candidate_fk" FOREIGN KEY ("linked_candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_brief_submission_attempts" ADD CONSTRAINT "opportunity_brief_submission_attempts_request_fk" FOREIGN KEY ("request_id") REFERENCES "public"."opportunity_brief_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_status_last_submitted_at_idx" ON "opportunity_brief_requests" USING btree ("status","last_submitted_at");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_created_at_idx" ON "opportunity_brief_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_participant_type_idx" ON "opportunity_brief_requests" USING btree ("participant_type");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_source_idx" ON "opportunity_brief_requests" USING btree ("source");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_linked_candidate_idx" ON "opportunity_brief_requests" USING btree ("linked_candidate_id");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_normalized_email_idx" ON "opportunity_brief_requests" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "opportunity_brief_requests_normalized_phone_number_idx" ON "opportunity_brief_requests" USING btree ("normalized_phone_number");--> statement-breakpoint
CREATE INDEX "opportunity_brief_submission_attempts_requester_created_at_idx" ON "opportunity_brief_submission_attempts" USING btree ("requester_hash","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_brief_submission_attempts_request_id_idx" ON "opportunity_brief_submission_attempts" USING btree ("request_id");