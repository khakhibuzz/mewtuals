import { describe, expect, it } from "vitest";
import { indiaBatteryRecords, batteryResearchSources, batteryResearchCheckedAt } from "../app/data/india-battery-research";
import { filterBatteryRecords } from "../app/domain/battery-research";
import { clusterMapPoints } from "../app/components/battery-atlas/map-points";
import { readFileSync } from "node:fs";
import { geoContains } from "d3-geo";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

describe("India battery research evidence", () => {
  it("provides dated sources for every claim and provenance for every locality marker", () => {
    expect(indiaBatteryRecords.length).toBeGreaterThanOrEqual(15);
    expect(new Set(indiaBatteryRecords.map((record) => record.id)).size).toBe(indiaBatteryRecords.length);
    for (const record of indiaBatteryRecords) {
      expect(record.sourceIds.length).toBeGreaterThan(0);
      for (const id of [...record.sourceIds, ...Object.values(record.facts ?? {}).flatMap((fact) => fact.sourceIds)]) {
        const source = batteryResearchSources[id];
        expect(source.url).toMatch(/^https:\/\//);
        if (source.date) expect(source.date <= batteryResearchCheckedAt).toBe(true);
      }
      if (record.location) {
        expect(record.location.geonamesId).toMatch(/^\d+$/);
        expect(record.location.latitude).toBeGreaterThan(6);
        expect(record.location.latitude).toBeLessThan(38);
        expect(record.location.longitude).toBeGreaterThan(68);
        expect(record.location.longitude).toBeLessThan(98);
      }
    }
  });

  it("keeps exploration, construction, agreements and robot development distinct from operations", () => {
    const record = (id: string) => indiaBatteryRecords.find((item) => item.id === id)!;
    expect(record("reasi").status).toBe("exploration");
    expect(record("agratas-sanand").status).toBe("planned");
    expect(record("hyundai-exide").status).toBe("agreement");
    expect(record("addverb-elixis").status).toBe("development");
    expect(record("kabil").location).toBeNull();
    expect(record("hyundai-exide").location).toBeNull();
    expect(record("addverb-elixis").location).toBeNull();
    expect(record("ola-cells").status).toBe("operating");
  });

  it("places every sourced locality inside its stated Indian state", () => {
    const geography = JSON.parse(readFileSync("app/data/india-states-simplified.geojson", "utf8")) as FeatureCollection<Polygon | MultiPolygon, { key: string }>;
    for (const record of indiaBatteryRecords) {
      if (!record.location) continue;
      const feature = geography.features.find((item) => item.properties.key === record.stateKey)!;
      expect(feature, record.name).toBeDefined();
      const geometry = feature.geometry;
      const oriented = geometry.type === "Polygon"
        ? { ...geometry, coordinates: geometry.coordinates.map((ring) => [...ring].reverse()) }
        : { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse())) };
      expect(geoContains({ ...feature, geometry: oriented }, [record.location.longitude, record.location.latitude]), record.name).toBe(true);
    }
  });

  it("keeps commercial unknowns and imported-cell agreements honest", () => {
    const sourcing = indiaBatteryRecords.find((record) => record.id === "greenfuel-eve")!;
    expect(sourcing.status).toBe("agreement");
    expect(sourcing.roles).not.toContain("cells");
    expect(sourcing.facts?.cellOrigin?.value).toContain("No shipment-level origin");
    for (const record of indiaBatteryRecords) {
      expect(record.facts?.moq).toBeUndefined();
      expect(record.facts?.leadTime).toBeUndefined();
    }
    expect(indiaBatteryRecords.some((record) => record.roles?.includes("bms"))).toBe(true);
    expect(indiaBatteryRecords.some((record) => record.roles?.includes("chargers"))).toBe(true);
  });

  it("filters the same evidence population for the map and the results list", () => {
    const cells = filterBatteryRecords(indiaBatteryRecords, "cells");
    expect(cells.map(({ id }) => id)).toContain("ola-cells");
    expect(cells.map(({ id }) => id)).not.toContain("amara-packs");
    expect(filterBatteryRecords(indiaBatteryRecords, null)).toHaveLength(indiaBatteryRecords.length);
    expect(filterBatteryRecords(indiaBatteryRecords, "refining").every((item) => item.stageIds.includes("refining"))).toBe(true);
  });
});

describe("map marker clustering", () => {
  it("keeps nearby clickable markers together and separates distant records", () => {
    const points = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 120, y: 100 }, { id: "c", x: 300, y: 300 }];
    const clusters = clusterMapPoints(points, 48);
    expect(clusters.map((cluster) => cluster.ids)).toEqual([["a", "b"], ["c"]]);
    expect(clusters[0].x).toBe(110);
    expect(clusterMapPoints(points, 10)).toHaveLength(3);
  });
});
