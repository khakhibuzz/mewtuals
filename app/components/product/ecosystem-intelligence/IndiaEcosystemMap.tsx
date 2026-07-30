import { geoContains, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { KeyboardEvent } from "react";

import indiaStatesRaw from "../../../data/india-states-simplified.geojson?raw";

import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemSnapshotDto } from "./types";

const MAP_WIDTH = 620;
const MAP_HEIGHT = 620;

type IndiaStateProperties = {
  key: string;
  name: string;
};

type IndiaStateFeature = Feature<Geometry, IndiaStateProperties>;
type IndiaStateCollection = FeatureCollection<Geometry, IndiaStateProperties>;
type GeographyDto = EcosystemSnapshotDto["geography"];

type IndiaEcosystemMapProps = {
  geography: GeographyDto;
  selectedStateKeys: readonly string[];
  selectedCityKeys: readonly string[];
  onStateFilter: (stateKey: string) => void;
  onCityFilter: (cityKey: string) => void;
};

const indiaStates = JSON.parse(indiaStatesRaw) as IndiaStateCollection;

function organisationLabel(count: number): string {
  return `${count} ${count === 1 ? "organisation" : "organisations"}`;
}

function isReliableCoordinate(
  city: GeographyDto["cities"][number],
): city is GeographyDto["cities"][number] & { latitude: number; longitude: number } {
  return city.latitude !== null && Number.isFinite(city.latitude) &&
    city.longitude !== null && Number.isFinite(city.longitude) &&
    city.latitude >= -90 && city.latitude <= 90 &&
    city.longitude >= -180 && city.longitude <= 180;
}

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, activate: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
}

function fillLevel(count: number, maximum: number): string {
  if (count === 0 || maximum === 0) return "0";
  const share = count / maximum;
  if (share >= 0.67) return "3";
  if (share >= 0.34) return "2";
  return "1";
}

function stableSvgCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function stateAccessibleName(label: string, count: number): string {
  return `${label}: ${organisationLabel(count)}`;
}

function cityDisplayLabel(label: string, stateLabel?: string): string {
  return stateLabel ? `${label}, ${stateLabel}` : label;
}

function cityAccessibleName(label: string, stateLabel: string | undefined, count: number): string {
  return `${cityDisplayLabel(label, stateLabel)}: ${organisationLabel(count)}`;
}

function orientForSphericalContainment(feature: IndiaStateFeature): IndiaStateFeature {
  const { geometry } = feature;

  // d3-geo treats clockwise exterior rings as the smaller spherical polygon.
  // The pinned asset follows standard GeoJSON winding, so reverse a copy only
  // for containment checks and keep the rendered source geometry unchanged.
  if (geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) => [...ring].reverse()),
      },
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => [...ring].reverse())
        ),
      },
    };
  }

  return feature;
}

export function IndiaEcosystemMap({
  geography,
  selectedStateKeys,
  selectedCityKeys,
  onStateFilter,
  onCityFilter,
}: IndiaEcosystemMapProps) {
  const stateCounts = new Map(geography.states.map((state) => [state.key, state]));
  const stateFeatures = new Map(
    indiaStates.features.map((feature) => [feature.properties.key, feature]),
  );
  const containmentStateFeatures = new Map(
    indiaStates.features.map((feature) => [
      feature.properties.key,
      orientForSphericalContainment(feature),
    ]),
  );
  const maximumStateCount = Math.max(0, ...geography.states.map(({ count }) => count));
  const rankedStates = [...geography.states].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const rankedCities = [...geography.cities].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const reliableCities = geography.cities.filter((city): city is GeographyDto["cities"][number] & {
    latitude: number;
    longitude: number;
  } => {
    if (!isReliableCoordinate(city)) return false;
    const stateFeature = containmentStateFeatures.get(city.stateKey);
    return stateFeature !== undefined && geoContains(
      stateFeature as IndiaStateFeature,
      [city.longitude, city.latitude],
    );
  });
  const projection = geoMercator().fitSize([MAP_WIDTH, MAP_HEIGHT], indiaStates);
  const path = geoPath(projection);

  return (
    <section className={styles.geographySection} aria-labelledby="ecosystem-geography-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Geographic evidence</p>
          <h2 id="ecosystem-geography-title">Where India is building</h2>
        </div>
        <p>{organisationLabel(geography.denominator)} in this filtered map</p>
      </div>

      <div className={styles.geographyGrid}>
        <div
          className={styles.rankedLocations}
          data-testid="india-ranked-locations"
          data-mobile-primary="true"
        >
          <div>
            <h3>States and union territories</h3>
            {rankedStates.length === 0 ? (
              <p className={styles.mutedCopy}>No resolved headquarters states in this view.</p>
            ) : (
              <ol className={styles.locationList}>
                {rankedStates.map((state) => {
                  const label = stateAccessibleName(state.label, state.count);
                  return (
                    <li key={state.key}>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={selectedStateKeys.includes(state.key)}
                        onClick={() => onStateFilter(state.key)}
                      >
                        <span>{state.label}</span>
                        <strong>{state.count}</strong>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <button
              className={styles.unknownLocationButton}
              type="button"
              aria-label={stateAccessibleName("Unknown headquarters", geography.unresolvedCount)}
              aria-pressed={selectedStateKeys.includes("unknown")}
              onClick={() => onStateFilter("unknown")}
            >
              <span>Unknown headquarters</span>
              <strong>{geography.unresolvedCount}</strong>
            </button>
          </div>

          <div>
            <h3>Cities</h3>
            {rankedCities.length === 0 ? (
              <p className={styles.mutedCopy}>No resolved headquarters cities in this view.</p>
            ) : (
              <ol className={styles.locationList}>
                {rankedCities.map((city) => (
                  <li key={`${city.stateKey}:${city.key}`}>
                    <button
                      type="button"
                      aria-label={cityAccessibleName(
                        city.label,
                        stateCounts.get(city.stateKey)?.label ?? stateFeatures.get(city.stateKey)?.properties.name,
                        city.count,
                      )}
                      aria-pressed={selectedCityKeys.includes(city.key)}
                      onClick={() => onCityFilter(city.key)}
                    >
                      <span>{cityDisplayLabel(
                        city.label,
                        stateCounts.get(city.stateKey)?.label ?? stateFeatures.get(city.stateKey)?.properties.name,
                      )}</span>
                      <strong>{city.count}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <figure className={styles.mapPanel}>
          <svg
            className={styles.indiaMap}
            data-testid="india-ecosystem-map"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            role="group"
            aria-labelledby="india-map-title india-map-description"
          >
            <title id="india-map-title">India headquarters coverage by state</title>
            <desc id="india-map-description">
              State shading represents mapped organisation counts. The ranked list provides the
              same values and controls without relying on colour.
            </desc>
            {indiaStates.features.map((feature) => {
              const state = stateCounts.get(feature.properties.key);
              const count = state?.count ?? 0;
              const shape = path(feature as IndiaStateFeature) ?? undefined;
              const selected = selectedStateKeys.includes(feature.properties.key);
              const mapShape = (
                <path
                  d={shape}
                  data-fill-level={fillLevel(count, maximumStateCount)}
                  data-selected={selected ? "true" : "false"}
                />
              );
              if (!state || count === 0) {
                return <g key={feature.properties.key} aria-hidden="true">{mapShape}</g>;
              }
              const label = stateAccessibleName(state.label, count);
              const rawCentroid = path.centroid(feature as IndiaStateFeature);
              const centroid = rawCentroid.map(stableSvgCoordinate) as [number, number];
              return (
                <g
                  key={feature.properties.key}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => onStateFilter(feature.properties.key)}
                  onKeyDown={(event) => activateOnKeyboard(
                    event,
                    () => onStateFilter(feature.properties.key),
                  )}
                >
                  <title>{label}</title>
                  {mapShape}
                  {Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) ? (
                    <text x={centroid[0]} y={centroid[1]} aria-hidden="true">{count}</text>
                  ) : null}
                </g>
              );
            })}
            {reliableCities.map((city) => {
              const point = projection([city.longitude, city.latitude]);
              if (!point) return null;
              const [pointX, pointY] = point.map(stableSvgCoordinate) as [number, number];
              const label = cityAccessibleName(
                city.label,
                stateCounts.get(city.stateKey)?.label ?? stateFeatures.get(city.stateKey)?.properties.name,
                city.count,
              );
              const selected = selectedCityKeys.includes(city.key);
              return (
                <g
                  key={`${city.stateKey}:${city.key}`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={selected}
                  data-testid="city-bubble"
                  data-city-key={city.key}
                  onClick={() => onCityFilter(city.key)}
                  onKeyDown={(event) => activateOnKeyboard(event, () => onCityFilter(city.key))}
                >
                  <title>{label}</title>
                  <circle
                    cx={pointX}
                    cy={pointY}
                    r={Math.min(13, 4 + Math.sqrt(city.count) * 2)}
                  />
                  <text x={pointX} y={pointY} aria-hidden="true">{city.count}</text>
                </g>
              );
            })}
          </svg>
          <figcaption>
            State fill is relative to this filtered view. City markers appear only for recorded,
            reliable public coordinates. Geometry derived from DataMeet maps; no live map service.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
