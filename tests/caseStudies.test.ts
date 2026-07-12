import { describe, expect, it } from "vitest";
import { caseStudies } from "../app/data/caseStudies";

const archetypes = [
  "Support automation × product analytics",
  "Wellness commerce × local service touchpoint",
  "Spend management × compliance expertise",
  "Developer tooling × implementation channel",
  "Mobility demand × hospitality distribution",
] as const;

describe("caseStudies", () => {
  it("defines five distinct illustrative studies in the approved order", () => {
    expect(caseStudies).toHaveLength(5);
    expect(caseStudies.map(({ id }) => id)).toHaveLength(
      new Set(caseStudies.map(({ id }) => id)).size,
    );
    expect(caseStudies.map(({ number }) => number)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
    ]);
    expect(caseStudies.map(({ opportunityType }) => opportunityType)).toEqual(
      archetypes,
    );
    expect(caseStudies.every(({ illustrative }) => illustrative)).toBe(true);
  });

  it("contains the complete card and deep-dive content contract", () => {
    for (const study of caseStudies) {
      expect(study.opportunityType).not.toHaveLength(0);
      expect(study.title).not.toHaveLength(0);
      expect(study.thesis).not.toHaveLength(0);
      expect(Object.values(study.equation).every(Boolean)).toBe(true);
      expect(study.situation).not.toHaveLength(0);
      expect(study.signal).not.toHaveLength(0);
      expect(study.hiddenLeverage).not.toHaveLength(0);
      expect(study.counterpart).not.toHaveLength(0);
      expect(study.valueExchange.representedCompany).not.toHaveLength(0);
      expect(study.valueExchange.counterpart).not.toHaveLength(0);
      expect(study.valueExchange.customer).not.toHaveLength(0);
      expect(study.test).not.toHaveLength(0);
      expect(study.firstApproach).not.toHaveLength(0);
      expect(study.executionSteps).toHaveLength(4);
      expect(study.executionSteps.every(Boolean)).toBe(true);
      expect(study.successMeasures.length).toBeGreaterThanOrEqual(3);
      expect(study.risks.length).toBeGreaterThanOrEqual(3);
      expect(study.decisionGate).not.toHaveLength(0);
    }
  });
});
