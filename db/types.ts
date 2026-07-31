import type {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  candidateResearchVersions,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  introductionRequests,
  magicLinks,
  onboardingDrafts,
  opportunities,
  opportunityBriefRequests,
  opportunityBriefSubmissionAttempts,
  profileOpportunities,
  profiles,
  sessions,
  signals,
  users,
  verificationReviews,
} from "./schema";
import type {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarRuns,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "./global-radar-schema";

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
export type OpportunityBriefRequest =
  typeof opportunityBriefRequests.$inferSelect;
export type NewOpportunityBriefRequest =
  typeof opportunityBriefRequests.$inferInsert;
export type OpportunityBriefSubmissionAttempt =
  typeof opportunityBriefSubmissionAttempts.$inferSelect;
export type NewOpportunityBriefSubmissionAttempt =
  typeof opportunityBriefSubmissionAttempts.$inferInsert;
export type ProfileOpportunity = typeof profileOpportunities.$inferSelect;
export type NewProfileOpportunity = typeof profileOpportunities.$inferInsert;
export type IntroductionRequest = typeof introductionRequests.$inferSelect;
export type NewIntroductionRequest = typeof introductionRequests.$inferInsert;
export type DiscoveryRun = typeof discoveryRuns.$inferSelect;
export type NewDiscoveryRun = typeof discoveryRuns.$inferInsert;
export type DiscoveryCandidate = typeof discoveryCandidates.$inferSelect;
export type NewDiscoveryCandidate = typeof discoveryCandidates.$inferInsert;
export type DiscoveryCandidateIdentifier =
  typeof discoveryCandidateIdentifiers.$inferSelect;
export type NewDiscoveryCandidateIdentifier =
  typeof discoveryCandidateIdentifiers.$inferInsert;
export type DiscoveryCandidateSource =
  typeof discoveryCandidateSources.$inferSelect;
export type NewDiscoveryCandidateSource =
  typeof discoveryCandidateSources.$inferInsert;
export type GlobalEntity = typeof globalEntities.$inferSelect;
export type NewGlobalEntity = typeof globalEntities.$inferInsert;
export type GlobalRadarRun = typeof globalRadarRuns.$inferSelect;
export type NewGlobalRadarRun = typeof globalRadarRuns.$inferInsert;
export type GlobalRadarSearchQuery =
  typeof globalRadarSearchQueries.$inferSelect;
export type NewGlobalRadarSearchQuery =
  typeof globalRadarSearchQueries.$inferInsert;
export type GlobalRadarSignal = typeof globalRadarSignals.$inferSelect;
export type NewGlobalRadarSignal = typeof globalRadarSignals.$inferInsert;
export type GlobalRadarSignalEntity =
  typeof globalRadarSignalEntities.$inferSelect;
export type NewGlobalRadarSignalEntity =
  typeof globalRadarSignalEntities.$inferInsert;
export type GlobalSignalRequirement =
  typeof globalSignalRequirements.$inferSelect;
export type NewGlobalSignalRequirement =
  typeof globalSignalRequirements.$inferInsert;
export type GlobalSignalEvidence = typeof globalSignalEvidence.$inferSelect;
export type NewGlobalSignalEvidence = typeof globalSignalEvidence.$inferInsert;
export type GlobalSignalUpdate = typeof globalSignalUpdates.$inferSelect;
export type NewGlobalSignalUpdate = typeof globalSignalUpdates.$inferInsert;
export type GlobalRadarWatchlistEntry =
  typeof globalRadarWatchlistEntries.$inferSelect;
export type NewGlobalRadarWatchlistEntry =
  typeof globalRadarWatchlistEntries.$inferInsert;
export type GlobalRadarPromotion = typeof globalRadarPromotions.$inferSelect;
export type NewGlobalRadarPromotion =
  typeof globalRadarPromotions.$inferInsert;
export type GlobalRadarAdminEvent = typeof globalRadarAdminEvents.$inferSelect;
export type NewGlobalRadarAdminEvent =
  typeof globalRadarAdminEvents.$inferInsert;
export type CandidateResearchVersion =
  typeof candidateResearchVersions.$inferSelect;
export type NewCandidateResearchVersion =
  typeof candidateResearchVersions.$inferInsert;
export type CandidateEcosystemClassification =
  typeof candidateEcosystemClassifications.$inferSelect;
export type NewCandidateEcosystemClassification =
  typeof candidateEcosystemClassifications.$inferInsert;
export type CandidateHeadquarters = typeof candidateHeadquarters.$inferSelect;
export type NewCandidateHeadquarters = typeof candidateHeadquarters.$inferInsert;
export type CandidatePublicSignal = typeof candidatePublicSignals.$inferSelect;
export type NewCandidatePublicSignal = typeof candidatePublicSignals.$inferInsert;
export type CandidateRelationship = typeof candidateRelationships.$inferSelect;
export type NewCandidateRelationship = typeof candidateRelationships.$inferInsert;
