import { z } from "zod";

export const profileStatuses = [
  "draft",
  "pending",
  "verified",
  "waitlisted",
] as const;

export const profileStatusSchema = z.enum(profileStatuses);
export type ProfileStatus = z.infer<typeof profileStatusSchema>;

const allowedTransitions: Readonly<
  Record<ProfileStatus, readonly ProfileStatus[]>
> = {
  draft: ["pending"],
  pending: ["verified", "waitlisted"],
  verified: [],
  waitlisted: [],
};

export const canTransitionProfileStatus = (
  current: ProfileStatus,
  next: ProfileStatus,
) => allowedTransitions[current].includes(next);

export const transitionProfileStatus = (
  current: ProfileStatus,
  next: ProfileStatus,
): ProfileStatus => {
  const validCurrent = profileStatusSchema.parse(current);
  const validNext = profileStatusSchema.parse(next);

  if (!canTransitionProfileStatus(validCurrent, validNext)) {
    throw new Error(`Cannot transition profile from ${current} to ${next}`);
  }

  return validNext;
};
