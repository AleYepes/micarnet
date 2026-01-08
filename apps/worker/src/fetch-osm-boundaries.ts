import path from "node:path";
import { db } from "@micarnet/db";
import {
  communities,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import axios from "axios";
import { eq, sql } from "drizzle-orm";
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

async function downloadFile(url: string, dest: string) {
  if (await fs.pathExists(dest)) {
    const stats = await fs.stat(dest);
    // If file is too small, it's likely corrupted or an error page
    if (stats.size > 1024 * 10) {
      console.log(
        `File already exists and seems valid: ${dest} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      );
      return;
    }
    console.log(
      `File exists but is too small (${stats.size} bytes). Redownloading...`
    );
    await fs.remove(dest);
  }

  console.log(`Downloading ${url}...`);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 600_000, // 10 minutes timeout for large downloads
  });

  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);

  return new Promise<void>((resolve, reject) => {
    writer.on("finish", () => {
      writer.close();
      resolve();
    });
    writer.on("error", (err) => {
      fs.remove(dest).catch(() => {}); // Try to cleanup
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

async function identifyRelevantRelations(
  filePath: string,
  matchedCommunityId: string
) {
  const relations: OsmRelation[] = [];
  const requiredWays = new Set<number>();

  for await (const item of createOSMStream(filePath)) {
    const osmItem = item as OsmItem;

    if (isRelevantAdminRelation(osmItem, matchedCommunityId)) {
      relations.push(osmItem);
      for (const member of osmItem.members) {
        if (member.type === "way") {
          requiredWays.add(member.ref);
        }
      }
    }
  }

  return { relations, requiredWays };
}

function isRelevantAdminRelation(
  item: OsmItem,
  matchedCommunityId: string
): item is OsmRelation {
  if (item.type !== "relation") {
    return false;
  }

  const adminLevel = item.tags?.admin_level
    ? Number.parseInt(item.tags.admin_level, 10)
    : null;

  if (
    item.tags?.boundary !== "administrative" ||
    adminLevel === null ||
    adminLevel < 4 ||
    adminLevel > 10
  ) {
    return false;
  }

  // Basic check: if it has ine:ccaa, it must match our community
  const ineCcaa = item.tags["ine:ccaa"]
    ? Number.parseInt(item.tags["ine:ccaa"], 10)
    : null;

  if (ineCcaa !== null && ineCcaa !== Number.parseInt(matchedCommunityId, 10)) {
    return false;
  }

  return true;
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

interface GeoJsonFeature {
  type: string;
  geometry: any;
  properties: Record<string, unknown>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Necessary complexity for data matching
async function getGeometryForRelation(
  rel: OsmRelation,
  ways: Map<number, OsmWay>,
  nodes: Map<number, [number, number]>
) {
  const osmData: { elements: (OsmRelation | OsmWay | OsmNode)[] } = {
    elements: [rel],
  };
  const addedElements = new Set<string>();

  for (const member of rel.members) {
    if (member.type === "way") {
      const way = ways.get(member.ref);
      if (way && !addedElements.has(`way/${member.ref}`)) {
        addedElements.add(`way/${member.ref}`);
        osmData.elements.push({
          ...way,
          nodes: way.refs, // osmtogeojson expects 'nodes', not 'refs'
        });
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

  const geojson = osmtogeojson(osmData) as { features: GeoJsonFeature[] };
  return geojson.features.find(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
  );
}

async function processRegion(url: string) {
  const filename = path.basename(url);
  const filePath = path.join(TEMP_DIR, filename);
  const regionSlug = filename.replace("-latest.osm.pbf", "").replace(/-/g, " ");

  await downloadFile(url, filePath);

  console.log(`Processing ${regionSlug} (${filename})...`);

  const allCommunities = await db.select().from(communities);
  const matches = stringSimilarity.findBestMatch(
    normalize(regionSlug),
    allCommunities.map((c) => normalize(c.name))
  );

  const matchedCommunity = allCommunities[matches.bestMatchIndex];
  if (!matchedCommunity || matches.bestMatch.rating < 0.3) {
    console.warn(`No strong match for ${regionSlug}. Skipping.`);
    return;
  }

  console.log(
    `Matched '${regionSlug}' to '${matchedCommunity.name}' (${matches.bestMatch.rating.toFixed(2)})`
  );

  const communityProvinces = await db
    .select()
    .from(provinces)
    .where(eq(provinces.communityId, matchedCommunity.id));
  const provinceIds = communityProvinces.map((p) => p.id);
  const communityMunicipalities = await db
    .select()
    .from(municipalities)
    .where(sql`${municipalities.provinceId} IN ${provinceIds}`);

  const { relations, requiredWays } = await identifyRelevantRelations(
    filePath,
    matchedCommunity.id
  );

  const { ways, requiredNodes } = await collectWaysAndNodes(
    filePath,
    requiredWays
  );

  const nodes = await collectNodeCoordinates(filePath, requiredNodes);

  console.log(
    `Found ${relations.length} administrative relations. Sorting by admin_level...`
  );

  // Sort relations so that levels 4, 6, 8 are processed before 9, 10
  relations.sort((a, b) => {
    const alvl = Number.parseInt(a.tags?.admin_level || "0", 10);
    const blvl = Number.parseInt(b.tags?.admin_level || "0", 10);
    return alvl - blvl;
  });

  const processedMunicipalities: { id: string; geometry: any }[] = [];

  for (const rel of relations) {
    const adminLevel = Number.parseInt(rel.tags?.admin_level || "0", 10);
    const feature = await getGeometryForRelation(rel, ways, nodes);
    if (!feature) continue;

    const baseData = {
      osmName: rel.tags?.name,
      adminLevel,
      population: rel.tags?.population
        ? Number.parseInt(rel.tags.population, 10)
        : null,
      populationDate: rel.tags?.["population:date"]
        ? Number.parseInt(rel.tags["population:date"], 10)
        : null,
      geometry: feature.geometry,
    };

    if (adminLevel === 4) {
      const ineCcaa = rel.tags?.["ine:ccaa"]
        ? Number.parseInt(rel.tags["ine:ccaa"], 10)
        : null;
      if (ineCcaa === Number.parseInt(matchedCommunity.id, 10)) {
        await db
          .update(communities)
          .set(baseData)
          .where(eq(communities.id, matchedCommunity.id));
        matchedCommunity.geometry = feature.geometry;
      }
    } else if (adminLevel === 6) {
      const ineProv = rel.tags?.["ine:provincia"]
        ? rel.tags["ine:provincia"].padStart(2, "0")
        : null;
      if (ineProv) {
        const targetProv = communityProvinces.find((p) => p.id === ineProv);
        if (targetProv) {
          await db
            .update(provinces)
            .set(baseData)
            .where(eq(provinces.id, ineProv));
          targetProv.geometry = feature.geometry;
        }
      }
    } else if (adminLevel === 8) {
      const ineMuni = rel.tags?.["ine:municipio"]
        ? rel.tags["ine:municipio"].padStart(5, "0")
        : null;
      if (ineMuni) {
        const targetMuni = communityMunicipalities.find(
          (m) => m.id === ineMuni
        );
        if (targetMuni) {
          await db
            .update(municipalities)
            .set(baseData)
            .where(eq(municipalities.id, ineMuni));
          targetMuni.geometry = feature.geometry;
          processedMunicipalities.push({
            id: ineMuni,
            geometry: feature.geometry,
          });
        }
      }
    } else if (adminLevel >= 9) {
      // Spatial matching for neighborhoods
      let parentMuniId: string | null = null;

      // Try to find a representative point (first vertex of the first ring)
      let testPoint: any = null;
      if (feature.geometry.type === "Polygon") {
        testPoint = feature.geometry.coordinates[0][0];
      } else if (feature.geometry.type === "MultiPolygon") {
        testPoint = feature.geometry.coordinates[0][0][0];
      }

      if (testPoint) {
        const pt = point(testPoint);
        // Check against processed municipalities in memory first
        for (const muni of processedMunicipalities) {
          if (booleanPointInPolygon(pt, muni.geometry)) {
            parentMuniId = muni.id;
            break;
          }
        }

        // If not found in memory (maybe it was already in DB), fallback to a subset of communityMunicipalities
        if (!parentMuniId) {
          for (const muni of communityMunicipalities) {
            if (
              muni.geometry &&
              booleanPointInPolygon(pt, muni.geometry as any)
            ) {
              parentMuniId = muni.id;
              break;
            }
          }
        }
      }

      if (parentMuniId) {
        await db
          .insert(neighborhoods)
          .values({
            id: `osm-${rel.id}`,
            name: rel.tags?.name || "Unknown",
            municipalityId: parentMuniId,
            ...baseData,
          })
          .onConflictDoUpdate({
            target: neighborhoods.id,
            set: baseData,
          });
      }
    }
  }
}

export async function syncOsmBoundaries() {
  await fs.ensureDir(TEMP_DIR);
  for (const url of REGION_URLS) {
    try {
      await processRegion(url);
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error);
    }
  }
}
