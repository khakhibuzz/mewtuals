CREATE TYPE "public"."availability" AS ENUM('open_now', 'open_selectively', 'not_available');--> statement-breakpoint
CREATE TYPE "public"."creator_subtype" AS ENUM('creator', 'podcaster', 'publication', 'media_operator');--> statement-breakpoint
CREATE TYPE "public"."identity_kind" AS ENUM('organisation', 'creator');--> statement-breakpoint
CREATE TYPE "public"."introduction_state" AS ENUM('requested', 'reviewing', 'contacting', 'connected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."organisation_subtype" AS ENUM('company', 'brand', 'startup', 'distribution_partner');--> statement-breakpoint
CREATE TYPE "public"."partnership_direction" AS ENUM('brand_creator', 'brand_brand', 'creator_creator', 'startup_distribution_partner');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'pending', 'verified', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."verification_decision" AS ENUM('verified', 'waitlisted');--> statement-breakpoint
CREATE TABLE "introduction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_opportunity_id" uuid NOT NULL,
	"state" "introduction_state" DEFAULT 'requested' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "introduction_requests_profile_opportunity_id_unique" UNIQUE("profile_opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"direction" "partnership_direction" NOT NULL,
	"counterparty_type" text NOT NULL,
	"eligible_identity_kinds" "identity_kind"[] NOT NULL,
	"eligible_organisation_subtypes" "organisation_subtype"[] NOT NULL,
	"eligible_creator_subtypes" "creator_subtype"[] NOT NULL,
	"open_to_tags" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "profile_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"fit_summary" text NOT NULL,
	"rank" integer NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_opportunities_profile_id_opportunity_id_unique" UNIQUE("profile_id","opportunity_id"),
	CONSTRAINT "profile_opportunities_rank_check" CHECK ("profile_opportunities"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"identity_kind" "identity_kind" NOT NULL,
	"organisation_name" text,
	"organisation_subtype" "organisation_subtype",
	"creator_subtype" "creator_subtype",
	"domain" text,
	"primary_url" text NOT NULL,
	"website_url" text,
	"linkedin_url" text,
	"social_url" text,
	"status" "profile_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_identity_subtype_check" CHECK ((
        ("profiles"."identity_kind" = 'organisation' AND "profiles"."organisation_subtype" IS NOT NULL AND "profiles"."creator_subtype" IS NULL)
        OR
        ("profiles"."identity_kind" = 'creator' AND "profiles"."creator_subtype" IS NOT NULL AND "profiles"."organisation_subtype" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"availability" "availability" DEFAULT 'open_now' NOT NULL,
	"open_to" text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"reviewer_email" text NOT NULL,
	"decision" "verification_decision" NOT NULL,
	"notes" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_reviews_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_profile_opportunity_id_profile_opportunities_id_fk" FOREIGN KEY ("profile_opportunity_id") REFERENCES "public"."profile_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_opportunities" ADD CONSTRAINT "profile_opportunities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_opportunities" ADD CONSTRAINT "profile_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "introduction_requests_state_idx" ON "introduction_requests" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "magic_links_token_hash_idx" ON "magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "magic_links_expires_at_idx" ON "magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "opportunities_direction_idx" ON "opportunities" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "opportunities_active_idx" ON "opportunities" USING btree ("active");--> statement-breakpoint
CREATE INDEX "profile_opportunities_profile_id_idx" ON "profile_opportunities" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profiles_status_idx" ON "profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "profiles_domain_idx" ON "profiles" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_reviews_decision_idx" ON "verification_reviews" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "verification_reviews_reviewer_email_idx" ON "verification_reviews" USING btree ("reviewer_email");