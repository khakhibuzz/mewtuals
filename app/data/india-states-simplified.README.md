# India state geometry

`india-states-simplified.geojson` is a build-time asset used only to draw the
administrator-only Ecosystem Intelligence map. The application does not fetch a
map, tiles, geocoding results, or geometry at runtime.

## Canonical upstream

- Repository: [`datameet/maps`](https://github.com/datameet/maps)
- Pinned revision: [`b3fbbde595310b397a55d718e0958ce249a4fa1f`](https://github.com/datameet/maps/tree/b3fbbde595310b397a55d718e0958ce249a4fa1f)
- Dataset: [`States/Admin2`](https://github.com/datameet/maps/tree/b3fbbde595310b397a55d718e0958ce249a4fa1f/States)
- Shapefile: [`States/Admin2.shp`](https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/States/Admin2.shp), Git blob `f59605fefeb40c9ce7ab23b8a420d68f540e6f81`
- Projection file: [`States/Admin2.prj`](https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/States/Admin2.prj), Git blob `f45cbadf0074d8b7b2669559a93bc50bb95f82d4` (WGS84 longitude/latitude)
- Attribute and index companions: [`States/Admin2.dbf`](https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/States/Admin2.dbf) and [`States/Admin2.shx`](https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/States/Admin2.shx)

The pinned `Admin2.shp` blob is the same blob currently present on the upstream
default branch. Pinning the revision keeps this build reproducible if that
changes later.

## Transparent conversion provenance

The original shapefile conversion was **not run in this repository**. The
checked-in starting GeoJSON was retrieved from this public intermediate:

- Repository and revision: [`OnlineBunker/ctemples@a57e4c1199a05be9540d5c2516792f0f3f451fd6`](https://github.com/OnlineBunker/ctemples/tree/a57e4c1199a05be9540d5c2516792f0f3f451fd6)
- Intermediate asset: [`scripts/geo-src/india-states-simplified.geojson`](https://github.com/OnlineBunker/ctemples/blob/a57e4c1199a05be9540d5c2516792f0f3f451fd6/scripts/geo-src/india-states-simplified.geojson)
- Intermediate Git blob: `ebf77375c4876f56830c89dc6145786d6ffe3aff`
- Retrieved intermediate byte size: `48,453`
- Documented build script: [`scripts/build-india-geo.mjs`](https://github.com/OnlineBunker/ctemples/blob/a57e4c1199a05be9540d5c2516792f0f3f451fd6/scripts/build-india-geo.mjs)

That build script records this one-time, topology-preserving Mapshaper command:

```sh
mapshaper Admin2.shp -simplify visvalingam keep-shapes 5% \
  -filter-fields ST_NM -rename-fields state=ST_NM \
  -o format=geojson precision=0.01 india-states-simplified.geojson
```

After retrieval, Mewtuals changed properties only; it did not modify geometry:

1. renamed `Andaman & Nicobar` to `Andaman and Nicobar Islands`;
2. renamed `Jammu & Kashmir` to `Jammu and Kashmir`;
3. derived the canonical lower-snake-case state key used by the application;
4. retained only `{ "key", "name" }` in each feature's properties.

## Working-file validation

- GeoJSON type: `FeatureCollection`
- Features: `36`
- Geometry types: `Polygon`, `MultiPolygon`
- Properties per feature: `key`, `name`
- Canonical registry comparison: all 36 keys match
  `indiaStateAndUnionTerritoryKeys`; no missing, extra, or duplicate keys
- Coordinate validation: finite WGS84 longitude/latitude ranges
- Working-file byte size: `49,095`
- SHA-256: `bef0b5e9e90b3b0542f562f14e011df665c576daf8bce65df0f9d752e9cc4712`

Recompute the file facts after any intentional geometry change:

```sh
wc -c app/data/india-states-simplified.geojson
shasum -a 256 app/data/india-states-simplified.geojson
```

## Attribution and license

India state geometry is derived from the DataMeet India community maps. The
pinned upstream repository includes the
[`MIT License`](https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/LICENSE):

> MIT License. Copyright (c) 2020 DataMeet India community. Permission is
> hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in
> the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to inclusion of the copyright and permission
> notices. The Software is provided "AS IS", without warranty of any kind.

The intermediate build script describes its DataMeet input as CC BY 4.0, while
the exact pinned DataMeet revision above contains the MIT license. This note
records that discrepancy rather than silently rewriting the intermediate's
provenance statement; DataMeet is attributed under either interpretation.
