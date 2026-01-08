import path from "node:path";
import { db } from "@micarnet/db";
import {
  communities,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "@turf/helpers";
import { feature, featureCollection, point } from "@turf/helpers";
import { union } from "@turf/union";
import axios from "axios";
import { eq } from "drizzle-orm";
import fs from "fs-extra";
import { createOSMStream } from "osm-pbf-parser-node";
import osmtogeojson from "osmtogeojson";
import stringSimilarity from "string-similarity";

const TEMP_DIR = path.join(process.cwd(), "temp_osm");

const REGION_URLS = [
  "https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/aragon-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/asturias-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/islas-baleares-latest.osm.pbf",
  "https://download.geofabrik.de/africa/canary-islands-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/cantabria-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/castilla-la-mancha-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/castilla-y-leon-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/ceuta-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/extremadura-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/galicia-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/madrid-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/melilla-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/murcia-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/pais-vasco-latest.osm.pbf",
  "https://download.geofabrik.de/europe/spain/la-rioja-latest.osm.pbf",
];

interface OsmMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
}

interface OsmTags {
  [key: string]: string;
}

interface OsmBase {
  id: number;
  type: string;
  tags?: OsmTags;
}

interface OsmNode extends OsmBase {
  type: "node";
  lat: number;
  lon: number;
}

interface OsmWay extends OsmBase {
  type: "way";
  refs: number[];
}

interface OsmRelation extends OsmBase {
  type: "relation";
  members: OsmMember[];
}

type OsmItem = OsmNode | OsmWay | OsmRelation;

interface BoundaryCandidate {
  geometry: GeoJSON.Geometry;
  osmName: string | null;
  ineCode: string | null;
  similarity: number;
  population: number | null;
  populationDate: number | null;
}

interface BoundaryData {
  id: number;
  code: string;
  officialName: string;
  osmName: string | null;
  osmPopulation: number | null;
  osmPopulationDate: number | null;
  osmGeometry: GeoJSON.Geometry | null;
  communityId?: number;
  provinceId?: number;
  candidates: BoundaryCandidate[];
}

async function downloadFile(url: string, dest: string) {
  if (await fs.pathExists(dest)) {
    await fs.remove(dest);
  }

  console.log(`Downloading ${url}...`);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 600_000,
  });

  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);

  return new Promise<void>((resolve, reject) => {
    writer.on("finish", () => {
      writer.close();
      resolve();
    });
    writer.on("error", (err) => {
      fs.remove(dest).catch(() => {
        /* ignore cleanup error */
      });
      reject(err);
    });
  });
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function identifyRelevantRelations(filePath: string) {
  const relations: OsmRelation[] = [];
  const requiredWays = new Set<number>();

  for await (const item of createOSMStream(filePath)) {
    const osmItem = item as OsmItem;

    if (
      osmItem.type === "relation" &&
      osmItem.tags?.boundary === "administrative"
    ) {
      const adminLevelStr = osmItem.tags.admin_level || "0";
      const adminLevel = Number.parseInt(adminLevelStr, 10);
      if (adminLevel >= 4 && adminLevel <= 10) {
        relations.push(osmItem);
        for (const member of osmItem.members) {
          if (member.type === "way") {
            requiredWays.add(member.ref);
          }
        }
      }
    }
  }

  return { relations, requiredWays };
}

async function collectWaysAndNodes(
  filePath: string,
  requiredWays: Set<number>
) {
  const ways = new Map<number, OsmWay>();
  const requiredNodes = new Set<number>();

  for await (const item of createOSMStream(filePath)) {
    const osmItem = item as OsmItem;
    if (osmItem.type === "way" && requiredWays.has(osmItem.id)) {
      ways.set(osmItem.id, osmItem);
      for (const nodeRef of osmItem.refs) {
        requiredNodes.add(nodeRef);
      }
    }
  }
  return { ways, requiredNodes };
}

async function collectNodeCoordinates(
  filePath: string,
  requiredNodes: Set<number>
) {
  const nodes = new Map<number, [number, number]>();

  for await (const item of createOSMStream(filePath)) {
    const osmItem = item as OsmItem;
    if (osmItem.type === "node" && requiredNodes.has(osmItem.id)) {
      nodes.set(osmItem.id, [osmItem.lon, osmItem.lat]);
    }
  }
  return nodes;
}

function ensureClosedRings(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (!(geometry && "coordinates" in geometry)) {
    return geometry;
  }

  const closeRing = (ring: number[][]) => {
    if (ring.length === 0) {
      return ring;
    }
    const first = ring[0];
    const last = ring.at(-1);
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([first[0], first[1]]);
    }
    return ring;
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates = geometry.coordinates.map(closeRing);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates = geometry.coordinates.map((poly) =>
      poly.map(closeRing)
    );
  }
  return geometry;
}

function getGeometryForRelation(
  rel: OsmRelation,
  ways: Map<number, OsmWay>,
  nodes: Map<number, [number, number]>
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined {
  const osmData: { elements: (OsmRelation | OsmWay | OsmNode)[] } = {
    elements: [rel],
  };
  const addedElements = new Set<string>();

  for (const member of rel.members) {
    if (member.type === "way") {
      const way = ways.get(member.ref);
      if (way && !addedElements.has(`way/${member.ref}`)) {
        addedElements.add(`way/${member.ref}`);
        const elementsWithNodes = {
          ...way,
          nodes: way.refs,
        } as OsmWay & { nodes: number[] };
        osmData.elements.push(elementsWithNodes);
        for (const nodeId of way.refs) {
          const node = nodes.get(nodeId);
          if (node && !addedElements.has(`node/${nodeId}`)) {
            addedElements.add(`node/${nodeId}`);
            osmData.elements.push({
              type: "node",
              id: nodeId,
              lon: node[0],
              lat: node[1],
            });
          }
        }
      }
    }
  }

  const geojson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;
  const found = geojson.features.find(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
  ) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;

  if (found) {
    found.geometry = ensureClosedRings(found.geometry) as
      | GeoJSON.Polygon
      | GeoJSON.MultiPolygon;
  }
  return found;
}

function findTargets(
  adminLevel: number,
  matchedCommunity: BoundaryData,
  relevantProvinces: BoundaryData[],
  relevantMunicipalities: BoundaryData[]
): { targets: BoundaryData[]; tagKey: string } {
  if (adminLevel === 4) {
    return { targets: [matchedCommunity], tagKey: "ine:ccaa" };
  }
  if (adminLevel === 6) {
    return { targets: relevantProvinces, tagKey: "ine:provincia" };
  }
  return { targets: relevantMunicipalities, tagKey: "ine:municipio" };
}

function matchRelationToTargets(
  rel: OsmRelation,
  geometry: GeoJSON.Geometry,
  targets: BoundaryData[],
  tagKey: string,
  adminLevel: number
) {
  const itemIneCode = rel.tags?.[tagKey]?.padStart(
    adminLevel === 8 ? 5 : 2,
    "0"
  );
  const osmName = rel.tags?.name || "";

  for (const target of targets) {
    const nameSimilarity = stringSimilarity.compareTwoStrings(
      normalize(osmName),
      normalize(target.officialName)
    );

    let isCandidate = false;
    if (itemIneCode) {
      if (itemIneCode === target.code || nameSimilarity > 0.6) {
        isCandidate = true;
      }
    } else if (nameSimilarity > 0.6) {
      isCandidate = true;
    }

    if (isCandidate) {
      target.candidates.push({
        geometry,
        osmName,
        ineCode: itemIneCode || null,
        similarity: nameSimilarity,
        population: rel.tags?.population
          ? Number.parseInt(rel.tags.population, 10)
          : null,
        populationDate: rel.tags?.["population:date"]
          ? Number.parseInt(rel.tags["population:date"], 10)
          : null,
      });
    }
  }
}

async function processRegion(
  url: string,
  communityMap: Map<number, BoundaryData>,
  provinceMap: Map<number, BoundaryData>,
  municipalityMap: Map<number, BoundaryData>,
  neighborhoodCandidates: { rel: OsmRelation; geometry: GeoJSON.Geometry }[]
) {
  const filename = path.basename(url);
  const filePath = path.join(TEMP_DIR, filename);
  const regionSlug = filename.replace("-latest.osm.pbf", "").replace(/-/g, " ");

  await downloadFile(url, filePath);
  console.log(`Processing ${regionSlug}...`);

  const allComms = Array.from(communityMap.values());
  const matches = stringSimilarity.findBestMatch(
    normalize(regionSlug),
    allComms.map((c) => normalize(c.officialName))
  );

  const matchedCommunity = allComms[matches.bestMatchIndex];
  if (!matchedCommunity || matches.bestMatch.rating < 0.3) {
    console.warn(`No strong match for ${regionSlug}.`);
    return;
  }

  const { relations, requiredWays } = await identifyRelevantRelations(filePath);
  const { ways, requiredNodes } = await collectWaysAndNodes(
    filePath,
    requiredWays
  );
  const nodes = await collectNodeCoordinates(filePath, requiredNodes);

  const relevantProvinces = Array.from(provinceMap.values()).filter(
    (p) => p.communityId === matchedCommunity.id
  );
  const relevantMunicipalities = Array.from(municipalityMap.values()).filter(
    (m) => m.provinceId && relevantProvinces.some((p) => p.id === m.provinceId)
  );

  for (const rel of relations) {
    const adminLevelStr = rel.tags?.admin_level || "0";
    const adminLevel = Number.parseInt(adminLevelStr, 10);
    const featureData = getGeometryForRelation(rel, ways, nodes);
    if (!featureData) {
      continue;
    }

    if (adminLevel === 9 || adminLevel === 10) {
      neighborhoodCandidates.push({ rel, geometry: featureData.geometry });
      continue;
    }

    const { targets, tagKey } = findTargets(
      adminLevel,
      matchedCommunity,
      relevantProvinces,
      relevantMunicipalities
    );

    matchRelationToTargets(
      rel,
      featureData.geometry,
      targets,
      tagKey,
      adminLevel
    );
  }
}

function filterByContainment(
  candidates: BoundaryCandidate[],
  parentGeometry: GeoJSON.Geometry
): BoundaryCandidate[] {
  const parentFeat = feature(parentGeometry);
  const contained = candidates.filter((c) => {
    let testPoint: number[] | null = null;
    if (c.geometry.type === "Polygon") {
      testPoint = c.geometry.coordinates[0][0];
    } else if (c.geometry.type === "MultiPolygon") {
      testPoint = c.geometry.coordinates[0][0][0];
    }
    return testPoint
      ? booleanPointInPolygon(point(testPoint), parentFeat)
      : true;
  });
  return contained.length > 0 ? contained : candidates;
}

function mergeCandidates(
  target: BoundaryData,
  candidates: BoundaryCandidate[]
) {
  console.log(
    `Merging ${candidates.length} candidates for ${target.officialName} (${target.code})`
  );
  try {
    let merged = feature(candidates[0].geometry) as Feature<
      Polygon | MultiPolygon
    >;
    let totalPop = candidates[0].population || 0;
    let popCount = candidates[0].population ? 1 : 0;

    for (let i = 1; i < candidates.length; i++) {
      const next = union(
        featureCollection([
          merged,
          feature(candidates[i].geometry) as Feature<Polygon | MultiPolygon>,
        ])
      );
      if (next) {
        merged = next as Feature<Polygon | MultiPolygon>;
      }
      const population = candidates[i].population;
      if (population) {
        totalPop += population;
        popCount++;
      }
    }
    target.osmGeometry = ensureClosedRings(merged.geometry);
    target.osmName = candidates[0].osmName;
    target.osmPopulation =
      popCount > 0 ? Math.round(totalPop / popCount) : null;
  } catch (e) {
    console.error(`Failed to union candidates for ${target.code}:`, e);
    const best = candidates.sort((a, b) => b.similarity - a.similarity)[0];
    target.osmGeometry = best.geometry;
    target.osmName = best.osmName;
  }
}

function resolveCandidates(
  target: BoundaryData,
  parentGeometry: GeoJSON.Geometry | null
): void {
  let filtered = [...target.candidates];
  if (filtered.length === 0) {
    return;
  }

  const withCorrectCode = filtered.filter((c) => c.ineCode === target.code);
  if (withCorrectCode.length > 0) {
    filtered = withCorrectCode;
  }

  if (filtered.length > 1) {
    const maxSim = Math.max(...filtered.map((c) => c.similarity));
    filtered = filtered.filter((c) => c.similarity === maxSim);
  }

  if (filtered.length > 1 && parentGeometry) {
    filtered = filterByContainment(filtered, parentGeometry);
  }

  if (filtered.length === 1) {
    target.osmGeometry = filtered[0].geometry;
    target.osmName = filtered[0].osmName;
    target.osmPopulation = filtered[0].population;
    target.osmPopulationDate = filtered[0].populationDate;
  } else if (filtered.length > 1) {
    mergeCandidates(target, filtered);
  }
}

async function loadOfficialBoundaries() {
  const [comms, provs, munis] = await Promise.all([
    db.select().from(communities),
    db.select().from(provinces),
    db.select().from(municipalities),
  ]);

  const communityMap = new Map<number, BoundaryData>(
    comms.map((c) => [
      c.id,
      {
        id: c.id,
        code: c.id.toString().padStart(2, "0"),
        officialName: c.name,
        osmName: c.osmName,
        osmPopulation: c.osmPopulation,
        osmPopulationDate: c.osmPopulationDate,
        osmGeometry: c.osmGeometry as GeoJSON.Geometry | null,
        candidates: [],
      },
    ])
  );
  const provinceMap = new Map<number, BoundaryData>(
    provs.map((p) => [
      p.id,
      {
        id: p.id,
        code: p.id.toString().padStart(2, "0"),
        officialName: p.name,
        osmName: p.osmName,
        osmPopulation: p.osmPopulation,
        osmPopulationDate: p.osmPopulationDate,
        osmGeometry: p.osmGeometry as GeoJSON.Geometry | null,
        communityId: p.communityId,
        candidates: [],
      },
    ])
  );
  const municipalityMap = new Map<number, BoundaryData>(
    munis.map((m) => [
      m.id,
      {
        id: m.id,
        code: m.id.toString().padStart(5, "0"),
        officialName: m.name,
        osmName: m.osmName,
        osmPopulation: m.osmPopulation,
        osmPopulationDate: m.osmPopulationDate,
        osmGeometry: m.osmGeometry as GeoJSON.Geometry | null,
        provinceId: m.provinceId,
        candidates: [],
      },
    ])
  );

  return { communityMap, provinceMap, municipalityMap };
}

async function saveBoundaries(
  communityMap: Map<number, BoundaryData>,
  provinceMap: Map<number, BoundaryData>,
  municipalityMap: Map<number, BoundaryData>
) {
  console.log("Saving boundaries to database...");
  for (const c of communityMap.values()) {
    if (c.osmGeometry) {
      await db
        .update(communities)
        .set({
          osmGeometry: c.osmGeometry,
          osmName: c.osmName,
          osmPopulation: c.osmPopulation,
          osmPopulationDate: c.osmPopulationDate,
        })
        .where(eq(communities.id, c.id));
    }
  }
  for (const p of provinceMap.values()) {
    if (p.osmGeometry) {
      await db
        .update(provinces)
        .set({
          osmGeometry: p.osmGeometry,
          osmName: p.osmName,
          osmPopulation: p.osmPopulation,
          osmPopulationDate: p.osmPopulationDate,
        })
        .where(eq(provinces.id, p.id));
    }
  }

  const munisWithGeo = Array.from(municipalityMap.values()).filter(
    (m) => m.osmGeometry
  );
  const chunkSize = 50;
  for (let i = 0; i < munisWithGeo.length; i += chunkSize) {
    const chunk = munisWithGeo.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((m) =>
        db
          .update(municipalities)
          .set({
            osmGeometry: m.osmGeometry,
            osmName: m.osmName,
            osmPopulation: m.osmPopulation,
            osmPopulationDate: m.osmPopulationDate,
          })
          .where(eq(municipalities.id, m.id))
      )
    );
  }
  return munisWithGeo;
}

async function processNeighborhoods(
  neighborhoodCandidates: { rel: OsmRelation; geometry: GeoJSON.Geometry }[],
  munisWithGeo: BoundaryData[]
) {
  console.log(
    "Processing neighborhoods using resolved municipality geometries..."
  );
  const munisWithBbox = munisWithGeo.map((m) => {
    const geom = m.osmGeometry;
    if (!geom) {
      throw new Error(`Missing geometry for municipality ${m.id}`);
    }
    return {
      id: m.id,
      geometry: geom,
      bbox: bbox(feature(geom)),
    };
  });

  for (const cand of neighborhoodCandidates) {
    let testPoint: number[] | null = null;
    if (cand.geometry.type === "Polygon") {
      testPoint = cand.geometry.coordinates[0][0];
    } else if (cand.geometry.type === "MultiPolygon") {
      testPoint = cand.geometry.coordinates[0][0][0];
    }

    if (testPoint) {
      const [lon, lat] = testPoint;
      let parentMuniId: number | null = null;

      for (const m of munisWithBbox) {
        const [minX, minY, maxX, maxY] = m.bbox;
        if (
          lon >= minX &&
          lon <= maxX &&
          lat >= minY &&
          lat <= maxY &&
          booleanPointInPolygon(point(testPoint), feature(m.geometry))
        ) {
          parentMuniId = m.id;
          break;
        }
      }

      if (parentMuniId) {
        const adminLevelStr = cand.rel.tags?.admin_level || "9";
        await db
          .insert(neighborhoods)
          .values({
            id: cand.rel.id,
            name: cand.rel.tags?.name || "Unknown",
            municipalityId: parentMuniId,
            osmAdminLevel: Number.parseInt(adminLevelStr, 10),
            osmGeometry: cand.geometry,
            osmName: cand.rel.tags?.name,
            osmPopulation: cand.rel.tags?.population
              ? Number.parseInt(cand.rel.tags.population, 10)
              : null,
            osmPopulationDate: cand.rel.tags?.["population:date"]
              ? Number.parseInt(cand.rel.tags["population:date"], 10)
              : null,
          })
          .onConflictDoUpdate({
            target: neighborhoods.id,
            set: { osmGeometry: cand.geometry },
          });
      }
    }
  }
}

export async function syncOsmBoundaries() {
  await fs.ensureDir(TEMP_DIR);

  console.log("Loading official location names from DB...");
  const { communityMap, provinceMap, municipalityMap } =
    await loadOfficialBoundaries();

  const neighborhoodCandidates: {
    rel: OsmRelation;
    geometry: GeoJSON.Geometry;
  }[] = [];

  for (const url of REGION_URLS) {
    try {
      await processRegion(
        url,
        communityMap,
        provinceMap,
        municipalityMap,
        neighborhoodCandidates
      );
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error);
    }
  }

  console.log("Resolving candidates for each level...");

  for (const c of communityMap.values()) {
    resolveCandidates(c, null);
  }

  for (const p of provinceMap.values()) {
    const parent = p.communityId ? communityMap.get(p.communityId) : null;
    resolveCandidates(p, parent?.osmGeometry || null);
  }

  for (const m of municipalityMap.values()) {
    const parent = m.provinceId ? provinceMap.get(m.provinceId) : null;
    resolveCandidates(m, parent?.osmGeometry || null);
  }

  const munisWithGeo = await saveBoundaries(
    communityMap,
    provinceMap,
    municipalityMap
  );

  await processNeighborhoods(neighborhoodCandidates, munisWithGeo);

  console.log("OSM Boundary Sync Complete.");
}
