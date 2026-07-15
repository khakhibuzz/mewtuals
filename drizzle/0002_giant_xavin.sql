CREATE TABLE "onboarding_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_kind" "identity_kind" NOT NULL,
	"organisation_subtype" "organisation_subtype",
	"creator_subtype" "creator_subtype",
	"website_url" text,
	"linkedin_url" text,
	"social_url" text,
	"business_email" text,
	"generated_name" text,
	"generated_organisation_name" text,
	"generated_domain" text,
	"primary_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_drafts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "onboarding_drafts_identity_subtype_check" CHECK ((
        ("onboarding_drafts"."identity_kind" = 'organisation' AND "onboarding_drafts"."organisation_subtype" IS NOT NULL AND "onboarding_drafts"."creator_subtype" IS NULL)
        OR
        ("onboarding_drafts"."identity_kind" = 'creator' AND "onboarding_drafts"."creator_subtype" IS NOT NULL AND "onboarding_drafts"."organisation_subtype" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;