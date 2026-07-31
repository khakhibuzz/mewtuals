import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { indiaStateAndUnionTerritoryKeys } from "../app/domain/ecosystem-intelligence-taxonomy";

const GEOMETRY_PATH = resolve("app/data/india-states-simplified.geojson");
const EXPECTED_BYTES = 49_095;
const EXPECTED_SHA256 = "bef0b5e9e90b3b0542f562f14e011df665c576daf8bce65df0f9d752e9cc4712";

type Position = [number, number];
type PolygonCoordinates = Position[][];
type Geometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: PolygonCoordinates[] };
type StateFeature = {
  type: "Feature";
  properties: { key: string; name: string };
  geometry: Geometry;
};

function rings(geometry: Geometry): Position[][] {
  return geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

function isFiniteWgs84Position(position: Position): boolean {
  const [longitude, latitude] = position;
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

describe("India ecosystem map geometry", () => {
  it("matches the pinned, validated 36-state artifact contract", () => {
    const bytes = readFileSync(GEOMETRY_PATH);
    const collection = JSON.parse(bytes.toString("utf8")) as {
      type: string;
      features: StateFeature[];
    };
    const keys = collection.features.map(({ properties }) => properties.key);

    expect(bytes.byteLength).toBe(EXPECTED_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(36);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...indiaStateAndUnionTerritoryKeys].sort());

    for (const feature of collection.features) {
      expect(feature.type).toBe("Feature");
      expect(Object.keys(feature.properties).sort()).toEqual(["key", "name"]);
      expect(["Polygon", "MultiPolygon"]).toContain(feature.geometry.type);
      for (const ring of rings(feature.geometry)) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring.every(isFiniteWgs84Position)).toBe(true);
        expect(ring.at(-1)).toEqual(ring[0]);
      }
    }
  });
});
