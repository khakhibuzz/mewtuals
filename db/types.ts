import type {
  introductionRequests,
  magicLinks,
  onboardingDrafts,
  opportunities,
  profileOpportunities,
  profiles,
  sessions,
  signals,
  users,
  verificationReviews,
} from "./schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MagicLink = typeof magicLinks.$inferSelect;
export type NewMagicLink = typeof magicLinks.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type OnboardingDraft = typeof onboardingDrafts.$inferSelect;
export type NewOnboardingDraft = typeof onboardingDrafts.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type VerificationReview = typeof verificationReviews.$inferSelect;
export type NewVerificationReview = typeof verificationReviews.$inferInsert;
export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type ProfileOpportunity = typeof profileOpportunities.$inferSelect;
export type NewProfileOpportunity = typeof profileOpportunities.$inferInsert;
export type IntroductionRequest = typeof introductionRequests.$inferSelect;
export type NewIntroductionRequest = typeof introductionRequests.$inferInsert;
