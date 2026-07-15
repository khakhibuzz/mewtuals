ALTER TABLE "opportunities" ADD COLUMN "reciprocal_value" text;
--> statement-breakpoint
UPDATE "opportunities"
SET "reciprocal_value" = CASE "key"
  WHEN 'brand-creator-audience-collaboration' THEN 'Relevant audience and editorial trust ↔ useful products, access, and campaign value'
  WHEN 'brand-brand-co-distribution' THEN 'Adjacent audience access ↔ complementary product value and shared demand'
  WHEN 'creator-creator-format-exchange' THEN 'Distinct expertise and format strength ↔ complementary audience and distribution'
  WHEN 'startup-distribution-partner-channel-pilot' THEN 'Relevant customer access ↔ a useful product story and measurable pilot learning'
  ELSE 'Relevant audience or distribution ↔ useful expertise, products, or access'
END;
--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "reciprocal_value" SET NOT NULL;
