import { z } from "zod";

export const availabilityValues = [
  "open_now",
  "open_selectively",
  "not_available",
] as const;

export const openToInterests = [
  "media_interviews",
  "podcasts",
  "creator_collaborations",
  "brand_collaborations",
  "product_reviews",
  "founder_stories",
  "distribution_partnerships",
  "co_marketing",
] as const;

export const availabilitySchema = z.enum(availabilityValues);
export const openToInterestSchema = z.enum(openToInterests);

const notesSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => value || undefined);

export const signalSchema = z.object({
  availability: availabilitySchema,
  openTo: z
    .array(openToInterestSchema)
    .min(1)
    .max(openToInterests.length)
    .refine((interests) => new Set(interests).size === interests.length, {
      message: "Choose each interest only once",
    }),
  notes: notesSchema,
});

export type Availability = z.infer<typeof availabilitySchema>;
export type OpenToInterest = z.infer<typeof openToInterestSchema>;
export type PartnershipSignal = z.infer<typeof signalSchema>;
