import path from "node:path";
import { db } from "@micarnet/db";
import {
  communities,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
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
  "https://download.geofabrik.de/europe/spain/comunidad-valenciana-latest.osm.pbf",
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
    console.log(`File already exists: ${dest}`);
    return;
  }
  console.log(`Downloading ${url}...`);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);
  return new Promise<void>((resolve, reject) => {
    writer.on("finish", () => resolve());
    writer.on("error", (err) => reject(err));
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

  const ineCcaa = item.tags["ine:ccaa"]
    ? Number.parseInt(item.tags["ine:ccaa"], 10)
    : null;

  if (ineCcaa && ineCcaa !== Number.parseInt(matchedCommunityId, 10)) {
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
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  properties: Record<string, unknown>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Necessary complexity for data matching
async function processRelation(
  rel: OsmRelation,
  matchedCommunity: typeof communities.$inferSelect,
  communityProvinces: (typeof provinces.$inferSelect)[],
  communityMunicipalities: (typeof municipalities.$inferSelect)[],
  ways: Map<number, OsmWay>,
  nodes: Map<number, [number, number]>,
  provinceIds: string[]
) {
  if (!rel.tags?.admin_level) {
    return;
  }
  const adminLevel = Number.parseInt(rel.tags.admin_level, 10);

  const ineCcaa = rel.tags["ine:ccaa"]
    ? Number.parseInt(rel.tags["ine:ccaa"], 10)
    : null;
  const ineProv = rel.tags["ine:provincia"]
    ? Number.parseInt(rel.tags["ine:provincia"], 10)
    : null;
  const ineMuni = rel.tags["ine:municipio"]
    ? Number.parseInt(rel.tags["ine:municipio"], 10)
    : null;

  if (ineCcaa && ineCcaa !== Number.parseInt(matchedCommunity.id, 10)) {
    return;
  }
  if (
    ineProv &&
    !provinceIds.map((id) => Number.parseInt(id, 10)).includes(ineProv)
  ) {
    return;
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geojson = osmtogeojson(osmData) as { features: GeoJsonFeature[] };
  const feature = geojson.features.find(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
  );

  if (!feature) {
    // console.log(`[DEBUG] No valid Polygon/MultiPolygon feature generated for ${relName} (${rel.id})`);
    return;
  }

  const data = {
    osmName: rel.tags.name,
    adminLevel,
    tags: rel.tags,
    population: rel.tags.population
      ? Number.parseInt(rel.tags.population, 10)
      : null,
    populationDate: rel.tags["population:date"]
      ? Number.parseInt(rel.tags["population:date"], 10)
      : null,
    ineCcaa,
    ineProvincia: ineProv,
    ineMunicipio: ineMuni,
    geometry: feature.geometry,
  };

  if (adminLevel === 4) {
    if (
      ineCcaa === Number.parseInt(matchedCommunity.id, 10) ||
      stringSimilarity.compareTwoStrings(
        normalize(rel.tags.name || ""),
        normalize(matchedCommunity.name)
      ) > 0.8
    ) {
      await db
        .update(communities)
        .set(data)
        .where(eq(communities.id, matchedCommunity.id));
    }
  } else if (adminLevel === 6) {
    const matchedProv = communityProvinces.find(
      (p) =>
        Number.parseInt(p.id, 10) === ineProv ||
        stringSimilarity.compareTwoStrings(
          normalize(rel.tags?.name || ""),
          normalize(p.name)
        ) > 0.8
    );
    if (matchedProv) {
      await db
        .update(provinces)
        .set(data)
        .where(eq(provinces.id, matchedProv.id));
    }
  } else if (adminLevel === 8) {
    const fullIneMuni =
      ineProv && ineMuni
        ? `${ineProv.toString().padStart(2, "0")}${ineMuni.toString().padStart(3, "0")}`
        : null;
    const matchedMuni = communityMunicipalities.find(
      (m) =>
        m.id === fullIneMuni ||
        stringSimilarity.compareTwoStrings(
          normalize(rel.tags?.name || ""),
          normalize(m.name)
        ) > 0.8
    );
    if (matchedMuni) {
      await db
        .update(municipalities)
        .set(data)
        .where(eq(municipalities.id, matchedMuni.id));
    }
  } else if (adminLevel >= 9) {
    let parentMuniId: string | null = null;
    if (ineProv && ineMuni) {
      parentMuniId = `${ineProv.toString().padStart(2, "0")}${ineMuni.toString().padStart(3, "0")}`;
    }

    if (parentMuniId) {
      await db
        .insert(neighborhoods)
        .values({
          id: `osm-${rel.id}`,
          name: rel.tags.name || "Unknown",
          municipalityId: parentMuniId,
          ...data,
        })
        .onConflictDoUpdate({
          target: neighborhoods.id,
          set: data,
        });
    }
  }
}

async function processRegion(url: string) {
  const filename = path.basename(url);
  const filePath = path.join(TEMP_DIR, filename);

  // Extract a "slug" name from the filename for matching
  // e.g., "castilla-la-mancha-latest.osm.pbf" -> "castilla la mancha"
  const regionSlug = filename.replace("-latest.osm.pbf", "").replace(/-/g, " ");

  await downloadFile(url, filePath);

  console.log(`Processing ${regionSlug} (${filename})...`);

  const allCommunities = await db.select().from(communities);

  // Fuzzy match the extracted slug against DB community names
  const matches = stringSimilarity.findBestMatch(
    normalize(regionSlug),
    allCommunities.map((c) => normalize(c.name))
  );

  const bestMatchIndex = matches.bestMatchIndex;
  const bestMatchScore = matches.bestMatch.rating;
  const matchedCommunity = allCommunities[bestMatchIndex];

  if (!matchedCommunity) {
    console.warn(`No community matched for ${regionSlug}. Skipping.`);
    return;
  }

  console.log(
    `Matched '${regionSlug}' to '${matchedCommunity.name}' (score: ${bestMatchScore.toFixed(2)})`
  );

  if (bestMatchScore < 0.3) {
    console.warn(
      `WARNING: Low match score for ${regionSlug}. Skipping to avoid errors.`
    );
    return;
  }

  const communityProvinces = await db
    .select()
    .from(provinces)
    .where(eq(provinces.communityId, matchedCommunity.id));
  const provinceIds = communityProvinces.map((p) => p.id);
  const communityMunicipalities = await db
    .select()
    .from(municipalities)
    .where(sql`${municipalities.provinceId} IN ${provinceIds}`);

  console.log("Pass 1: Identifying relevant relations and dependencies...");
  const { relations, requiredWays } = await identifyRelevantRelations(
    filePath,
    matchedCommunity.id
  );

  console.log("Pass 2: Collecting required ways and their nodes...");
  const { ways, requiredNodes } = await collectWaysAndNodes(
    filePath,
    requiredWays
  );

  console.log("Pass 3: Collecting required nodes coordinates...");
  const nodes = await collectNodeCoordinates(filePath, requiredNodes);

  console.log(`Found ${relations.length} administrative relations.`);

  for (const rel of relations) {
    await processRelation(
      rel,
      matchedCommunity,
      communityProvinces,
      communityMunicipalities,
      ways,
      nodes,
      provinceIds
    );
  }

  console.log(`Finished processing ${regionSlug}`);
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
