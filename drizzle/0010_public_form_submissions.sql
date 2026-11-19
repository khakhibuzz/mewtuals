CREATE TABLE "public_form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"message" jsonb NOT NULL,
	"requester_hash" text NOT NULL,
	"request_id" uuid,
	"request_status" "opportunity_brief_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "public_form_submissions_form_check" CHECK ("public_form_submissions"."form" in ('apply', 'join')),
	CONSTRAINT "public_form_submissions_payload_hash_check" CHECK ("public_form_submissions"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "public_form_submissions_attempt_count_check" CHECK ("public_form_submissions"."attempt_count" >= 0),
	CONSTRAINT "public_form_submissions_error_length_check" CHECK (length("public_form_submissions"."last_error") <= 1000),
	CONSTRAINT "public_form_submissions_acceptance_check" CHECK (("public_form_submissions"."accepted_at" is null) = ("public_form_submissions"."provider_message_id" is null))
);
--> statement-breakpoint
ALTER TABLE "public_form_submissions" ADD CONSTRAINT "public_form_submissions_request_fk" FOREIGN KEY ("request_id") REFERENCES "public"."opportunity_brief_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_form_submissions_requester_created_at_idx" ON "public_form_submissions" USING btree ("requester_hash","created_at");--> statement-breakpoint
CREATE INDEX "public_form_submissions_pending_created_at_idx" ON "public_form_submissions" USING btree ("created_at") WHERE "public_form_submissions"."accepted_at" is null;