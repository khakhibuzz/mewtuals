CREATE TABLE "candidate_research_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"discovery_run_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"findings" text NOT NULL,
	"source_urls" jsonb NOT NULL,
	"analysis_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_research_versions_candidate_run_unique" UNIQUE("candidate_id","discovery_run_id"),
	CONSTRAINT "candidate_research_versions_summary_check" CHECK (length("candidate_research_versions"."summary") between 80 and 1200),
	CONSTRAINT "candidate_research_versions_findings_check" CHECK (length("candidate_research_versions"."findings") between 600 and 12000),
	CONSTRAINT "candidate_research_versions_sources_check" CHECK (jsonb_typeof("candidate_research_versions"."source_urls") = 'array' and jsonb_array_length("candidate_research_versions"."source_urls") between 1 and 12),
	CONSTRAINT "candidate_research_versions_analysis_check" CHECK ("candidate_research_versions"."analysis_version" = 'physical-ai-v1')
);
--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN "campaign_key" text DEFAULT 'general_discovery' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_research_versions" ADD CONSTRAINT "candidate_research_versions_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_research_versions" ADD CONSTRAINT "candidate_research_versions_run_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_research_versions_candidate_created_idx" ON "candidate_research_versions" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_research_versions_run_idx" ON "candidate_research_versions" USING btree ("discovery_run_id");