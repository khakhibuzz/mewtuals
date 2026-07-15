ALTER TABLE "magic_links" ADD COLUMN "requester_hash" text;--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "issued" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "magic_links_requester_hash_created_at_idx" ON "magic_links" USING btree ("requester_hash","created_at");--> statement-breakpoint
CREATE INDEX "magic_links_created_at_idx" ON "magic_links" USING btree ("created_at");