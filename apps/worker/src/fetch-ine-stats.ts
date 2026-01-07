import { db } from "@micarnet/db";
import { communities, municipalities } from "@micarnet/db/schema/locations";
import {
  buckets,
  statsByCommunity,
  statsByMunicipality,
} from "@micarnet/db/schema/stats";
import axios from "axios";

const INE_DATOS_TABLA_BASE =
  "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA";

interface IneDataRow {
  COD: string;
  Nombre: string;
  Data: {
    Anyo: number;
    Valor: number;
    Fecha: number;
  }[];
}

async function fetchIneTable(
  tableId: number,
  filters: string[] = []
): Promise<IneDataRow[]> {
  let url = `${INE_DATOS_TABLA_BASE}/${tableId}`;
  if (filters.length > 0) {
    const queryString = filters
      .map((f) => (f.startsWith("tv=") ? f : `tv=${f}`))
      .join("&");
    url += `?${queryString}`;
  }
  try {
    const response = await axios.get<IneDataRow[]>(url);
    return response.data;
  } catch (_error) {
    // Return empty array on 404/500/No data to allow continuation
    return [];
  }
}

async function seedBuckets() {
  const employeeBucketsData = [
    { code: "total", label: "Total", sortOrder: 0 },
    { code: "0", label: "Sin asalariados", sortOrder: 1 },
    { code: "1-2", label: "De 1 a 2 asalariados", sortOrder: 2 },
    { code: "3-5", label: "De 3 a 5 asalariados", sortOrder: 3 },
    { code: "6-9", label: "De 6 a 9 asalariados", sortOrder: 4 },
    { code: "10-19", label: "De 10 a 19 asalariados", sortOrder: 5 },
    { code: "20-49", label: "De 20 a 49 asalariados", sortOrder: 6 },
    { code: "50-99", label: "De 50 a 99 asalariados", sortOrder: 7 },
    { code: "100-249", label: "De 100 a 249 asalariados", sortOrder: 8 },
    { code: "250-499", label: "De 250 a 499 asalariados", sortOrder: 9 },
    { code: "500-999", label: "De 500 a 999 asalariados", sortOrder: 10 },
    { code: "1000-4999", label: "De 1.000 a 4.999 asalariados", sortOrder: 11 },
    { code: "5000+", label: "De 5.000 o más asalariados", sortOrder: 12 },
  ];

  for (const bucket of employeeBucketsData) {
    await db
      .insert(buckets)
      .values(bucket)
      .onConflictDoUpdate({
        target: buckets.code,
        set: { label: bucket.label },
      });
  }
}

export async function syncIneStats() {
  console.log("Starting INE Stats Sync...");
  await seedBuckets();

  const bucketRows = await db.select().from(buckets);
  const commRows = await db.select().from(communities);

  await syncCommunityStats(commRows, bucketRows);
  await syncMunicipalityStats();

  console.log("INE Stats Sync Complete.");
}

async function syncCommunityStats(
  commRows: (typeof communities.$inferSelect)[],
  bucketRows: (typeof buckets.$inferSelect)[]
) {
  console.log("Syncing Community Stats (CNAE 855)...");
  for (const comm of commRows) {
    if (!(comm.ineId && comm.ineFkVariable)) {
      continue;
    }
    console.log(`Processing Community: ${comm.name}...`);
    await processCommunity(comm, bucketRows);
  }
}

async function processCommunity(
  comm: typeof communities.$inferSelect,
  bucketRows: (typeof buckets.$inferSelect)[]
) {
  const locationFilter = `${comm.ineFkVariable}:${comm.ineId}`;
  const filters = ["338:18326", locationFilter]; // 338:18326 is CNAE 855

  const [companies, locales] = await Promise.all([
    fetchIneTable(73_020, filters),
    fetchIneTable(294, filters),
  ]);

  const allRows = [...companies, ...locales];

  for (const row of allRows) {
    const isCompany = companies.includes(row);
    const bucketLabel = row.Nombre.split(". ")[1]?.trim() || "Total";
    const bucket = bucketRows.find((b) =>
      bucketLabel.includes(b.label.replace("asalariados", "").trim())
    );

    if (!bucket) {
      continue;
    }

    for (const dp of row.Data) {
      if (dp.Anyo < 2020) {
        continue;
      }

      const baseValues = {
        communityId: comm.id,
        employeeBucketId: bucket.id,
        year: dp.Anyo,
      };

      await db
        .insert(statsByCommunity)
        .values(
          isCompany
            ? { ...baseValues, cnae855CompanyCount: dp.Valor }
            : { ...baseValues, cnae855LocaleCount: dp.Valor }
        )
        .onConflictDoUpdate({
          target: [
            statsByCommunity.communityId,
            statsByCommunity.employeeBucketId,
            statsByCommunity.year,
          ],
          set: isCompany
            ? { cnae855CompanyCount: dp.Valor }
            : { cnae855LocaleCount: dp.Valor },
        });
    }
  }
}

async function syncMunicipalityStats() {
  console.log("Syncing Municipality Stats...");
  const muniRows = await db.select().from(municipalities);
  console.log(
    `Found ${muniRows.length} municipalities. This may take a while.`
  );

  const chunkSize = 20;
  for (let i = 0; i < muniRows.length; i += chunkSize) {
    const chunk = muniRows.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processMunicipality));

    if (i % 100 === 0) {
      console.log(`Processed ${i} / ${muniRows.length} municipalities...`);
    }
  }
}

async function processMunicipality(muni: typeof municipalities.$inferSelect) {
  if (!(muni.ineId && muni.ineFkVariable)) {
    return;
  }

  const locationFilter = `${muni.ineFkVariable}:${muni.ineId}`;

  // Fetch Population (Table 29005), Education Companies (Table 4721), and All Companies (Table 4721)
  const [popData, eduCompData, allCompData] = await Promise.all([
    fetchIneTable(29_005, ["18:451", locationFilter]),
    fetchIneTable(4721, ["491:23100", locationFilter]),
    fetchIneTable(4721, ["393:23092", locationFilter]),
  ]);

  const statsByYear = new Map<
    number,
    { pop?: number; edu?: number; all?: number }
  >();

  const addToMap = (rows: IneDataRow[], key: "pop" | "edu" | "all") => {
    for (const row of rows) {
      for (const dp of row.Data) {
        if (dp.Anyo >= 2020) {
          const entry = statsByYear.get(dp.Anyo) || {};
          entry[key] = dp.Valor;
          statsByYear.set(dp.Anyo, entry);
        }
      }
    }
  };

  addToMap(popData, "pop");
  addToMap(eduCompData, "edu");
  addToMap(allCompData, "all");

  for (const [year, data] of statsByYear.entries()) {
    await db
      .insert(statsByMunicipality)
      .values({
        municipalityId: muni.id,
        year,
        totalPopulation: data.pop ? Math.round(data.pop) : null,
        sectionPCompaniesCount: data.edu ? Math.round(data.edu) : null,
        allCompaniesCount: data.all ? Math.round(data.all) : null,
      })
      .onConflictDoUpdate({
        target: [statsByMunicipality.municipalityId, statsByMunicipality.year],
        set: {
          totalPopulation: data.pop ? Math.round(data.pop) : null,
          sectionPCompaniesCount: data.edu ? Math.round(data.edu) : null,
          allCompaniesCount: data.all ? Math.round(data.all) : null,
        },
      });
  }
}
