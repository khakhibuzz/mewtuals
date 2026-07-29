import { NextResponse } from "next/server";

import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import type {
  EcosystemCandidateDetail,
  EcosystemResearchVersionDto,
  EcosystemSignalDto,
  EcosystemSnapshot,
} from "../../db/repositories/ecosystem-intelligence-repository";
import type {
  EcosystemFilterInput,
  EcosystemIntelligenceActor,
  EcosystemIntelligenceFailure,
} from "./ecosystem-intelligence-service";

type SessionReader = () => Promise<AuthenticatedSession | null>;
const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "private, no-store" } as const;

const actorFrom = (session: AuthenticatedSession): EcosystemIntelligenceActor => ({
  userId: session.user.id,
  email: session.user.email,
});

function failure(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

function serializeSignal(signal: EcosystemSignalDto) {
  return {
    id: signal.id,
    candidateId: signal.candidateId,
    candidateName: signal.candidateName,
    type: signal.type,
    title: signal.title,
    occurredAt: signal.occurredAt.toISOString(),
    expiresAt: signal.expiresAt?.toISOString() ?? null,
    activeUntil: signal.activeUntil.toISOString(),
    sourceUrl: signal.sourceUrl,
    confidence: signal.confidence,
  };
}

function serializeResearch(research: EcosystemResearchVersionDto | null) {
  if (!research) return null;
  return {
    id: research.id,
    discoveryRunId: research.discoveryRunId,
    summary: research.summary,
    findings: research.findings,
    sourceUrls: research.sourceUrls,
    analysisVersion: research.analysisVersion,
    createdAt: research.createdAt.toISOString(),
  };
}

export function serializeEcosystemSnapshot(snapshot: EcosystemSnapshot) {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    filters: snapshot.filters,
    population: snapshot.population,
    summary: snapshot.summary,
    dataQuality: snapshot.dataQuality,
    geography: snapshot.geography,
    explorer: snapshot.explorer,
    matrices: snapshot.matrices,
    insights: snapshot.insights,
    velocity: snapshot.velocity,
    momentum: {
      ...snapshot.momentum,
      signals: snapshot.momentum.signals.map(serializeSignal),
    },
    relationships: {
      ...snapshot.relationships,
      edges: snapshot.relationships.edges.map((edge) => ({
        id: edge.id,
        sourceCandidateId: edge.sourceCandidateId,
        targetCandidateId: edge.targetCandidateId,
        type: edge.type,
        evidenceUrl: edge.evidenceUrl,
        confidence: edge.confidence,
        observedAt: edge.observedAt?.toISOString() ?? null,
      })),
    },
    ledger: {
      ...snapshot.ledger,
      items: snapshot.ledger.items.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
        description: candidate.description,
        category: candidate.category,
        status: candidate.status,
        discoveryScore: candidate.discoveryScore,
        discoveredAt: candidate.discoveredAt.toISOString(),
        websiteUrl: candidate.websiteUrl,
        linkedinUrl: candidate.linkedinUrl,
        primarySocialUrl: candidate.primarySocialUrl,
        classifications: candidate.classifications,
        headquarters: candidate.headquarters,
        evidenceCoverage: candidate.evidenceCoverage,
        evidenceFreshness: candidate.evidenceFreshness,
        activeSignalCount: candidate.activeSignalCount,
        documentedRelationshipCount: candidate.documentedRelationshipCount,
        latestSourceUrl: candidate.latestSourceUrl,
        latestResearchAt: candidate.latestResearchAt?.toISOString() ?? null,
      })),
    },
    filterOptions: snapshot.filterOptions,
  };
}

export function serializeEcosystemCandidateDetail(candidate: EcosystemCandidateDetail) {
  return {
    id: candidate.id,
    type: candidate.type,
    name: candidate.name,
    description: candidate.description,
    category: candidate.category,
    subcategory: candidate.subcategory,
    status: candidate.status,
    discoveryScore: candidate.discoveryScore,
    discoveredAt: candidate.discoveredAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    publicUrls: candidate.publicUrls,
    classifications: candidate.classifications,
    headquarters: candidate.headquarters,
    signals: candidate.signals.map(serializeSignal),
    relationships: candidate.relationships.map((relationship) => ({
      id: relationship.id,
      direction: relationship.direction,
      sourceCandidateId: relationship.sourceCandidateId,
      sourceName: relationship.sourceName,
      targetCandidateId: relationship.targetCandidateId,
      targetName: relationship.targetName,
      type: relationship.type,
      evidenceUrl: relationship.evidenceUrl,
      confidence: relationship.confidence,
      observedAt: relationship.observedAt?.toISOString() ?? null,
    })),
    sources: candidate.sources.map((source) => ({
      id: source.id,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      firstSeenAt: source.firstSeenAt.toISOString(),
      lastSeenAt: source.lastSeenAt.toISOString(),
    })),
    research: {
      current: serializeResearch(candidate.research.current),
      history: candidate.research.history.map((version) => serializeResearch(version)!),
    },
  };
}

export function createEcosystemIntelligenceGetHandler(dependencies: {
  getSession: SessionReader;
  getSnapshot: (
    actor: EcosystemIntelligenceActor,
    filters: EcosystemFilterInput,
  ) => Promise<
    | { ok: true; snapshot: EcosystemSnapshot }
    | EcosystemIntelligenceFailure
  >;
}) {
  return async function GET(request: Request) {
    const session = await dependencies.getSession();
    if (!session) return failure(401, "Sign in to continue.");
    const result = await dependencies.getSnapshot(
      actorFrom(session),
      new URL(request.url).searchParams,
    );
    if (!result.ok) return failure(result.status, result.error);
    return NextResponse.json(
      {
        ok: true,
        snapshot: serializeEcosystemSnapshot(result.snapshot),
      },
      { headers: PRIVATE_RESPONSE_HEADERS },
    );
  };
}

export function createEcosystemIntelligenceCandidateGetHandler(dependencies: {
  getSession: SessionReader;
  getCandidateDetail: (
    actor: EcosystemIntelligenceActor,
    candidateId: string,
  ) => Promise<
    | { ok: true; candidate: EcosystemCandidateDetail }
    | EcosystemIntelligenceFailure
  >;
}) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ candidateId: string }> },
  ) {
    const session = await dependencies.getSession();
    if (!session) return failure(401, "Sign in to continue.");
    const { candidateId } = await context.params;
    const result = await dependencies.getCandidateDetail(
      actorFrom(session),
      candidateId,
    );
    if (!result.ok) return failure(result.status, result.error);
    return NextResponse.json(
      {
        ok: true,
        candidate: serializeEcosystemCandidateDetail(result.candidate),
      },
      { headers: PRIVATE_RESPONSE_HEADERS },
    );
  };
}
