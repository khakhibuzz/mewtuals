# Global Demand Radar fictional examples

These six examples are test fixtures, not live Radar records. Every exported
value has the exact wrapper shape
`{ fictionalExample: true, input: validRadarFixture }`. Only the inner `input`
is schema-valid. The wrapper deliberately fails the production batch,
persistence, and repository-facing canonicalization gates, so the marker can
never be submitted as Radar data.

The fixture organisations, public identifiers, and UUIDs are deterministic and
fictional. Every URL uses a reserved `.example` hostname. No production module
imports `tests/fixtures/global-radar-fictional.ts`; production lists, metrics,
detail views, and actions must continue to read only persisted Radar data. If a
component test renders one of these fixtures, it must visibly label it
`Fictional example — not a live radar signal.` and disable mutations.

## Gate matrix

| Fixture label | Class gate | India gate | Translation gate | Momentum gate |
| --- | --- | --- | --- | --- |
| `teleoperatedRobotDataDirectDemandNeedsReview` | An explicit, current `data_collection_request` is supported by original official evidence. Unresolved sensitive-data and compliance facts reduce actionability and set the initial status to `needs_review`. | The evidence makes no India claim, so the server preserves `no_current_India_fit` instead of inferring one. | English original evidence needs no translation score. | Not applicable; this is one organisation's direct request. |
| `humanoidDeploymentDemandPrecursor` | Dated original evidence supports `precursorDevelopment.deployment`; there is no direct ask, so the fixture remains `demand_precursor` and is never labelled procurement. | No India connection is evidenced, so it remains `no_current_India_fit`. | English original evidence needs no translation score. | Not applicable; the announcement is a single precursor to monitor. |
| `indiaAutonomousNavigationDataDirectDemand` | An explicit, unexpired `data_collection_request` is supported by the organisation's original publication. | The same original claim positively names suppliers, collection, roads, and India, supporting `explicit_India.roads_or_environments`. | English original evidence needs no translation score. | Not applicable; this is direct demand. |
| `chineseIndianManufacturingDirectDemand` | An explicit, unexpired `manufacturing_request` is supported by the original Chinese publication. | The Chinese claim positively names India and manufacturing, supporting `explicit_India.manufacturing`. | The Han-script claim is preserved separately from an English summary and carries translation confidence `92`; removing either fails the translation gate. | Not applicable; this is direct demand. |
| `noisyIndianLanguageSpeechDirectDemand` | An explicit, unexpired `data_collection_request` is supported by original official evidence for noisy speech. | The claim positively names suppliers in India and language collection, supporting `explicit_India.languages`. | English original evidence needs no translation score; the requested data concerns Hindi and Tamil speech. | Not applicable; this is direct demand. |
| `multiOrganisationPhysicalAiPlatformMomentum` | No external ask is asserted. Two publications support an `ecosystem_momentum` direction in physical-AI evaluation infrastructure. | Neither source establishes India relevance, so the fixture keeps `no_current_India_fit`. | Both original publications are in English. | Two non-syndicated evidence items resolve to two independent entities and corporate groups, at least one item is primary, and taxonomy consistency and evidence quality clear their thresholds. Removing an entity, merging their public identities, syndicating an item, or lowering a threshold prevents qualification. |

## Expected pass and fail boundaries

For tests, validate each `input` with a deterministic clock set to
`2026-07-31T00:00:00.000Z` and trusted run and plan identities copied from that
input. Each inner proposal must yield exactly one accepted, canonical,
persistable signal with zero rejection counts.

Do not strip the marker and treat the wrapper as transport data. Passing the
wrapper itself to the rich proposal schema, the legacy strict batch schema, the
persistence-object schema, or the repository-facing canonicalizer must fail.
This separation lets tests demonstrate classification while preventing example
data from entering live Radar storage or administrator workflows.
