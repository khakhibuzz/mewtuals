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

## Complete example records

### `teleoperatedRobotDataDirectDemandNeedsReview`

- Signal class: `direct_demand`, specifically an explicit
  `data_collection_request`.
- Evidence required: original official evidence must state the current external
  request for teleoperated manipulation trajectories and support
  `directDemandAsk.data_collection_request`.
- Required capabilities: `teleoperated_trajectories`, including teleoperation,
  trajectory review, and successful/failed-outcome QA.
- India relevance: `no_current_India_fit`; the source does not name India, and
  eligible delivery geographies remain unknown.
- Systems context: Improve a robot manipulation policy with reviewed
  trajectories. Captured teleoperation sessions become quality-controlled
  training examples used to evaluate successful and failed robot actions.
- Correct admin status: `needs_review`, because material consent, participant
  rights, de-identification, and related compliance facts remain unresolved.

### `humanoidDeploymentDemandPrecursor`

- Signal class: `demand_precursor`, specifically a dated `deployment`; the
  publication contains no external supplier ask.
- Evidence required: original official evidence must establish the announced
  pilot deployment and support `precursorDevelopment.deployment` without
  supporting a direct-demand field.
- Required capabilities: `integration`, including controlled-site system
  integration and deployment support.
- India relevance: `no_current_India_fit`; no India connection or eligible
  supplier geography is publicly established.
- Systems context: Deploy a humanoid system in controlled pilot facilities.
  Tested hardware and control software are integrated into a supervised pilot
  unit capable of the documented tasks.
- Correct admin status: `newly_discovered`; the evidence-backed score has full
  coverage and the resolved compliance assessment does not force review.

### `indiaAutonomousNavigationDataDirectDemand`

- Signal class: `direct_demand`, specifically an explicit
  `data_collection_request`.
- Evidence required: original official evidence must name suppliers in India,
  mixed Indian roads, autonomous-navigation collection, and the current request,
  supporting both `directDemandAsk.data_collection_request` and
  `indiaRelevance.explicit_India.roads_or_environments`.
- Required capabilities: `indian_mixed_unstructured_roads`, including an
  instrumented fleet, synchronized RGB/GPS/IMU observations, safety drivers,
  and field-data QA.
- India relevance: `explicit_India`; India is the stated collection geography,
  while road-user privacy remains a constraint to verify.
- Systems context: Evaluate autonomous navigation on mixed and unstructured
  roads. Synchronized road observations are quality-checked before evaluation
  of navigation behavior across varied traffic interactions.
- Correct admin status: `newly_discovered`; the evidence-backed score has full
  coverage and the resolved compliance assessment does not force review.

### `chineseIndianManufacturingDirectDemand`

- Signal class: `direct_demand`, specifically an explicit
  `manufacturing_request`.
- Evidence required: the original Han-script official publication, a separate
  English summary, and translation confidence must support both
  `directDemandAsk.manufacturing_request` and
  `indiaRelevance.explicit_India.manufacturing`.
- Required capabilities: `contract_manufacturing`, including component
  production, assembly, and manufacturing QA for the mobile robot platform.
- India relevance: `explicit_India`; the original Chinese evidence names
  manufacturing partners in India, with export-control applicability left
  unresolved rather than inferred.
- Systems context: Assemble a fictional mobile robot platform from specified
  components. Supplied components become quality-controlled assemblies ready
  for integration testing.
- Correct admin status: `newly_discovered`; the translated evidence is complete,
  the score has full coverage, and possible industrial-secret/export-control
  flags do not by themselves force review.

### `noisyIndianLanguageSpeechDirectDemand`

- Signal class: `direct_demand`, specifically an explicit
  `data_collection_request`.
- Evidence required: original official evidence must name suppliers in India,
  noisy Hindi and Tamil speech, robot-command evaluation, and the current
  request, supporting `directDemandAsk.data_collection_request` and
  `indiaRelevance.explicit_India.languages`.
- Required capabilities: `noisy_far_field_speech`, including consent-aware
  speech collection, acoustic-condition capture, command-intent annotation,
  and multilingual QA.
- India relevance: `explicit_India`; India is the stated collection geography,
  while voice consent and de-identification remain constraints to verify.
- Systems context: Evaluate human-robot speech understanding in noisy
  environments. Annotated multilingual audio becomes evaluation data for noisy
  Hindi and Tamil robot commands.
- Correct admin status: `newly_discovered`; the evidence-backed score has full
  coverage and the resolved compliance assessment does not force review.

### `multiOrganisationPhysicalAiPlatformMomentum`

- Signal class: `ecosystem_momentum`; it is an ecosystem direction and never a
  direct external request.
- Evidence required: at least two independent, non-syndicated public sources
  from separate entities and corporate groups, including primary evidence, must
  support the same physical-AI evaluation taxonomy.
- Required capabilities: `model_evaluation`, including repeatable evaluation
  infrastructure for physical-AI data platforms.
- India relevance: `no_current_India_fit`; neither independent publication
  establishes an India connection.
- Systems context: Intentionally null. The record is a multi-organisation
  ecosystem direction, and the evidence does not justify inventing one
  organisation-specific system chain.
- Correct admin status: `newly_discovered`; the derived momentum score has full
  coverage, passes its independent-evidence gates, and does not require
  compliance review.

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
