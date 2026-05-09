# Idealista-First Geo Refactor

Refactor geo around a canonical region tree sourced from an Idealista GeoJSON snapshot, then enrich that tree with INE/DGT-compatible official codes. Skip/drop OSM enrichment from the schema for the time being.

The canonical hierarchy becomes: communities, provinces, municipalities, districts, neighborhoods. The first 3 are acknowledged by INE. The last four acknowledged by Idealista. Schools should only reference the new neighborhoods table, which will now link to the new districts table rather than the municipalities table.

## Schemas

I'm not sure how we should refactor the schemas, but I would like them to resemble the current location schemas more than the geojson schema. The raw geojson effectively has the columns: shortUri, tree_depth, parent_shortUri, name, parentName, total, ring_count, zooms, and geometry for every row entry. We definitely don't want to store all of these in the tables. The only cols we will want are name, shortUri (to be named idealista_shortUri), and geometry. We can drop/ignore the remaining columns, however, we will likely need to use some to fit the geojson data into the multitable schema. For example, the 'parentName' col to derive the hierarchy, and so which table each row belongs in and all the corresponding FKs to parent tables.

geometry should replace the current osm_geometry. As for names, I'm not sure what the best approach is either. Atm, the location tables have two name columns:

- name, the official name derived from INE, but which is at times formated unconventionally; for example "Xàbia/Jávea" or "Orxa, l'/Lorcha".
- and osm_name, which is the the name by osm, which is sometimes slightly different; for example "Xàbia / Jávea" or "l'Orxa / Lorcha".

The idealista dataset will likely use the most colloquial variants, since I'm sure idealista has thouroughly user-tested and optimized their data, and so it may create a new 3rd set of names, but adding a 3rd column seems unwise, so I'm thinking I could create a names table or cache instead. It could just store names and FK to the corresponding locations tables. So the location tables would represent the "essence" of the location regardless of the various names it may have. This means we'd need new PKs for all the tables, not simple incremental integers, and they would have to be unique accross the different tables, not just within one table. Although it might work, it seems like an overcomplicated solution, so I'm leaning to just sticking to one name col prioritizing idealista-names > INE-names > OSM-names

In any case, all of this will likely break the current osm logic. So let's drop it for now

## Key Changes

- Add a new geo.districts table with self-parenting tree structure:
  - id, parent_id, source, source_id, name, normalized_name, level_depth, geometry, bbox, metadata.
  - INE enrichment columns: ine_code, ine_level, province_id, municipality_id where confidently matched.
  - Unique source identity on (source, source_id).
- Keep geo.communities as the INE CCAA root layer because Idealista starts at province depth.
- Replace neighborhoodId usage in schools and students with regionId, pointing to geo.regions.
- Treat the current neighborhoods table as legacy during migration, then remove or stop writing it after consumers move to regions.

## Worker Flow

- Commit the Idealista GeoJSON under a stable path such as apps/worker/data/idealista-regions.geojson.
- Run order:
  1. Sync INE locations.
  2. Import Idealista regions.
  3. Match/enrich Idealista province and municipality-like regions with INE codes.
  4. Optionally import OSM regions only when their polygons do not intersect existing Idealista polygons for the same municipality/province context.
  5. Sync INE stats.
  6. Sync DGT schools and assign each school to the deepest containing region.
- Exclude Idealista roots that do not match Spanish INE provinces, such as Andorra, Gibraltar, French Cerdanya, and País Vasco Francés.

## Matching Rules

- Idealista tree_depth = 0 maps to Spanish provinces after stripping " provincia" and matching against INE province names.
- CCAA association comes from the matched INE province’s existing communityId.
- Municipality matching should use containment plus normalized name matching against INE municipalities:
  - strong match: same province, normalized name match or accepted variant.
  - fallback: polygon containment inside an INE municipality geometry if available.
  - unresolved regions remain canonical but without municipality_id.
- School assignment uses point-in-polygon against candidate regions, chooses the deepest containing region, and stores only regionId.
- OSM expansion only inserts a region when its polygon does not intersect an Idealista polygon in the relevant parent area.

## Test Plan

- Add importer tests for:
  - Idealista tree parent/child reconstruction.
  - province name normalization and INE matching.
  - exclusion of non-Spanish province roots.
  - deepest-region school assignment for Madrid examples like Retiro and Chamartín.
  - OSM candidate rejection when intersecting an Idealista region.
- Run pnpm run check-types.
- Run worker against a local database and verify:
  - all Spanish INE provinces match an Idealista root or are reported.
  - schools receive a regionId.
  - derived CCAA/province/municipality path can be resolved from each assigned school region.

## Assumptions

- The committed Idealista snapshot is the production source of truth; updates happen manually by replacing the snapshot in the repo.
- Idealista is canonical for user-facing regional search and school assignment.
- INE remains canonical for official codes, stats joins, and DGT compatibility.
- OSM remains useful only as an enrichment source for non-overlapping gaps, not as the primary neighborhood source.
