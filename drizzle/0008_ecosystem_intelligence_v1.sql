CREATE TABLE "candidate_ecosystem_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"term_key" text NOT NULL,
	"evidence_state" text NOT NULL,
	"confidence" integer NOT NULL,
	"basis" text NOT NULL,
	"source_urls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_ecosystem_classifications_candidate_kind_term_unique" UNIQUE("candidate_id","kind","term_key"),
	CONSTRAINT "candidate_ecosystem_classifications_kind_term_check" CHECK (length(btrim("candidate_ecosystem_classifications"."kind")) > 0 AND length(btrim("candidate_ecosystem_classifications"."term_key")) > 0),
	CONSTRAINT "candidate_ecosystem_classifications_evidence_state_check" CHECK ("candidate_ecosystem_classifications"."evidence_state" IN ('evidence_backed', 'inferred')),
	CONSTRAINT "candidate_ecosystem_classifications_confidence_check" CHECK ("candidate_ecosystem_classifications"."confidence" >= 0 AND "candidate_ecosystem_classifications"."confidence" <= 100),
	CONSTRAINT "candidate_ecosystem_classifications_basis_check" CHECK (length(btrim("candidate_ecosystem_classifications"."basis")) between 1 and 1000),
	CONSTRAINT "candidate_ecosystem_classifications_sources_check" CHECK (jsonb_typeof("candidate_ecosystem_classifications"."source_urls") = 'array' and jsonb_array_length("candidate_ecosystem_classifications"."source_urls") between 1 and 12 and jsonb_path_query_array("candidate_ecosystem_classifications"."source_urls", '$[*] ? (@.type() == "string" && @ like_regex "^https?://")') = "candidate_ecosystem_classifications"."source_urls")
);
--> statement-breakpoint
CREATE TABLE "candidate_headquarters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"state_key" text NOT NULL,
	"state_label" text NOT NULL,
	"city_key" text NOT NULL,
	"city_label" text NOT NULL,
	"latitude_microdegrees" integer,
	"longitude_microdegrees" integer,
	"evidence_state" text NOT NULL,
	"confidence" integer NOT NULL,
	"source_urls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_headquarters_candidate_unique" UNIQUE("candidate_id"),
	CONSTRAINT "candidate_headquarters_country_check" CHECK ("candidate_headquarters"."country_code" = 'IN'),
	CONSTRAINT "candidate_headquarters_location_check" CHECK (length(btrim("candidate_headquarters"."state_key")) > 0 AND length(btrim("candidate_headquarters"."state_label")) > 0 AND length(btrim("candidate_headquarters"."city_key")) > 0 AND length(btrim("candidate_headquarters"."city_label")) > 0),
	CONSTRAINT "candidate_headquarters_coordinates_check" CHECK (("candidate_headquarters"."latitude_microdegrees" IS NULL AND "candidate_headquarters"."longitude_microdegrees" IS NULL) OR ("candidate_headquarters"."latitude_microdegrees" IS NOT NULL AND "candidate_headquarters"."longitude_microdegrees" IS NOT NULL)),
	CONSTRAINT "candidate_headquarters_latitude_check" CHECK ("candidate_headquarters"."latitude_microdegrees" IS NULL OR ("candidate_headquarters"."latitude_microdegrees" >= -90000000 AND "candidate_headquarters"."latitude_microdegrees" <= 90000000)),
	CONSTRAINT "candidate_headquarters_longitude_check" CHECK ("candidate_headquarters"."longitude_microdegrees" IS NULL OR ("candidate_headquarters"."longitude_microdegrees" >= -180000000 AND "candidate_headquarters"."longitude_microdegrees" <= 180000000)),
	CONSTRAINT "candidate_headquarters_evidence_state_check" CHECK ("candidate_headquarters"."evidence_state" IN ('evidence_backed', 'inferred')),
	CONSTRAINT "candidate_headquarters_confidence_check" CHECK ("candidate_headquarters"."confidence" >= 0 AND "candidate_headquarters"."confidence" <= 100),
	CONSTRAINT "candidate_headquarters_sources_check" CHECK (jsonb_typeof("candidate_headquarters"."source_urls") = 'array' and jsonb_array_length("candidate_headquarters"."source_urls") between 1 and 12 and jsonb_path_query_array("candidate_headquarters"."source_urls", '$[*] ? (@.type() == "string" && @ like_regex "^https?://")') = "candidate_headquarters"."source_urls")
);
--> statement-breakpoint
CREATE TABLE "candidate_public_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"source_url" text NOT NULL,
	"confidence" integer NOT NULL,
	"evidence_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_public_signals_signal_type_check" CHECK (length(btrim("candidate_public_signals"."signal_type")) between 1 and 100),
	CONSTRAINT "candidate_public_signals_title_check" CHECK (length(btrim("candidate_public_signals"."title")) between 1 and 300),
	CONSTRAINT "candidate_public_signals_source_url_check" CHECK (length(btrim("candidate_public_signals"."source_url")) > 0 AND "candidate_public_signals"."source_url" ~ '^https?://'),
	CONSTRAINT "candidate_public_signals_confidence_check" CHECK ("candidate_public_signals"."confidence" >= 0 AND "candidate_public_signals"."confidence" <= 100),
	CONSTRAINT "candidate_public_signals_evidence_key_check" CHECK (length(btrim("candidate_public_signals"."evidence_key")) > 0),
	CONSTRAINT "candidate_public_signals_expiry_check" CHECK ("candidate_public_signals"."expires_at" IS NULL OR "candidate_public_signals"."expires_at" >= "candidate_public_signals"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "candidate_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_candidate_id" uuid NOT NULL,
	"target_candidate_id" uuid,
	"target_public_name" text,
	"relationship_type" text NOT NULL,
	"evidence_url" text NOT NULL,
	"confidence" integer NOT NULL,
	"observed_at" timestamp with time zone,
	"evidence_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_relationships_target_check" CHECK (("candidate_relationships"."target_candidate_id" IS NOT NULL AND "candidate_relationships"."target_public_name" IS NULL) OR ("candidate_relationships"."target_candidate_id" IS NULL AND "candidate_relationships"."target_public_name" IS NOT NULL AND length(btrim("candidate_relationships"."target_public_name")) > 0)),
	CONSTRAINT "candidate_relationships_self_link_check" CHECK ("candidate_relationships"."target_candidate_id" IS NULL OR "candidate_relationships"."source_candidate_id" <> "candidate_relationships"."target_candidate_id"),
	CONSTRAINT "candidate_relationships_type_check" CHECK (length(btrim("candidate_relationships"."relationship_type")) between 1 and 100),
	CONSTRAINT "candidate_relationships_evidence_url_check" CHECK (length(btrim("candidate_relationships"."evidence_url")) > 0 AND "candidate_relationships"."evidence_url" ~ '^https?://'),
	CONSTRAINT "candidate_relationships_confidence_check" CHECK ("candidate_relationships"."confidence" >= 0 AND "candidate_relationships"."confidence" <= 100),
	CONSTRAINT "candidate_relationships_evidence_key_check" CHECK (length(btrim("candidate_relationships"."evidence_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "candidate_ecosystem_classifications" ADD CONSTRAINT "candidate_ecosystem_classifications_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_headquarters" ADD CONSTRAINT "candidate_headquarters_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_public_signals" ADD CONSTRAINT "candidate_public_signals_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_relationships" ADD CONSTRAINT "candidate_relationships_source_candidate_fk" FOREIGN KEY ("source_candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_relationships" ADD CONSTRAINT "candidate_relationships_target_candidate_fk" FOREIGN KEY ("target_candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_ecosystem_classifications_candidate_idx" ON "candidate_ecosystem_classifications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_ecosystem_classifications_kind_term_idx" ON "candidate_ecosystem_classifications" USING btree ("kind","term_key");--> statement-breakpoint
CREATE INDEX "candidate_ecosystem_classifications_evidence_state_idx" ON "candidate_ecosystem_classifications" USING btree ("evidence_state");--> statement-breakpoint
CREATE INDEX "candidate_ecosystem_classifications_confidence_idx" ON "candidate_ecosystem_classifications" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "candidate_headquarters_state_idx" ON "candidate_headquarters" USING btree ("state_key");--> statement-breakpoint
CREATE INDEX "candidate_headquarters_city_idx" ON "candidate_headquarters" USING btree ("city_key");--> statement-breakpoint
CREATE INDEX "candidate_headquarters_evidence_state_idx" ON "candidate_headquarters" USING btree ("evidence_state");--> statement-breakpoint
CREATE INDEX "candidate_headquarters_confidence_idx" ON "candidate_headquarters" USING btree ("confidence");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_public_signals_evidence_key_idx" ON "candidate_public_signals" USING btree ("evidence_key");--> statement-breakpoint
CREATE INDEX "candidate_public_signals_candidate_idx" ON "candidate_public_signals" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_public_signals_type_idx" ON "candidate_public_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "candidate_public_signals_occurred_at_idx" ON "candidate_public_signals" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "candidate_public_signals_expires_at_idx" ON "candidate_public_signals" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_relationships_evidence_key_idx" ON "candidate_relationships" USING btree ("evidence_key");--> statement-breakpoint
CREATE INDEX "candidate_relationships_source_candidate_idx" ON "candidate_relationships" USING btree ("source_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_relationships_target_candidate_idx" ON "candidate_relationships" USING btree ("target_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_relationships_type_idx" ON "candidate_relationships" USING btree ("relationship_type");--> statement-breakpoint
CREATE INDEX "candidate_relationships_observed_at_idx" ON "candidate_relationships" USING btree ("observed_at");
