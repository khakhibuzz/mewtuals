import { z } from "zod";

import { validateApplication } from "../lib/application";

const normalizedWorkEmailSchema = z.email();

export const applicationInputSchema = z.strictObject({
  companyUrl: z.string().max(2_048, "Company URL must be at most 2048 characters."),
  workEmail: z.string().max(320, "Work email must be at most 320 characters."),
  phone: z.string().max(80, "Phone number must be at most 80 characters."),
  website: z.string().max(0).optional().default(""),
}).transform((input, context) => {
  const result = validateApplication(input);
  if (!result.ok) {
    for (const [field, message] of Object.entries(result.errors)) {
      context.addIssue({ code: "custom", path: [field], message });
    }
    return z.NEVER;
  }
  if (!normalizedWorkEmailSchema.safeParse(result.value.workEmail).success) {
    context.addIssue({
      code: "custom",
      path: ["workEmail"],
      message: "Enter a valid work email.",
    });
    return z.NEVER;
  }
  return { ...result.value, website: input.website };
});

export type ApplicationSubmissionInput = z.infer<typeof applicationInputSchema>;
