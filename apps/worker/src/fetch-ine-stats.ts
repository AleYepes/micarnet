import { db } from "@micarnet/db";
import { communities, municipalities } from "@micarnet/db/schema/locations";
import {
  buckets,
  metadata,
  statsByCommunity,
  statsByMunicipality,
} from "@micarnet/db/schema/stats";
import axios from "axios";
import { and, isNotNull } from "drizzle-orm";

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
    if (!Array.isArray(response.data)) {
      console.warn(`Non-array response for table ${tableId}:`, response.data);
      return [];
    }
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to fetch table ${tableId}:`, message);
    // Return empty array on 404/500/No data to allow continuation
    return [];
  }
}

async function seedMetadata(
  tableId: number,
  name: string,
  description: string,
  url: string
) {
  await db
    .insert(metadata)
    .values({
      ineTableId: tableId,
      name,
      description,
      sourceUrl: url,
    })
    .onConflictDoUpdate({
      target: metadata.ineTableId,
      set: {
        name,
        description,
        sourceUrl: url,
      },
    });
}

async function seedBuckets() {
  const employeeBucketsData = [
    { name: "Total", minEmployees: 0, maxEmployees: null, isTotal: 1 },
    { name: "Sin asalariados", minEmployees: 0, maxEmployees: 0, isTotal: 0 },
    {
      name: "De 1 a 2 asalariados",
      minEmployees: 1,
      maxEmployees: 2,
      isTotal: 0,
    },
    {
      name: "De 3 a 5 asalariados",
      minEmployees: 3,
      maxEmployees: 5,
      isTotal: 0,
    },
    {
      name: "De 6 a 9 asalariados",
      minEmployees: 6,
      maxEmployees: 9,
      isTotal: 0,
    },
    {
      name: "De 10 a 19 asalariados",
      minEmployees: 10,
      maxEmployees: 19,
      isTotal: 0,
    },
    {
      name: "De 20 a 49 asalariados",
      minEmployees: 20,
      maxEmployees: 49,
      isTotal: 0,
    },
    {
      name: "De 50 a 99 asalariados",
      minEmployees: 50,
      maxEmployees: 99,
      isTotal: 0,
    },
    {
      name: "De 100 a 249 asalariados",
      minEmployees: 100,
      maxEmployees: 249,
      isTotal: 0,
    },
    {
      name: "De 250 a 499 asalariados",
      minEmployees: 250,
      maxEmployees: 499,
      isTotal: 0,
    },
    {
      name: "De 500 a 999 asalariados",
      minEmployees: 500,
      maxEmployees: 999,
      isTotal: 0,
    },
    {
      name: "De 1.000 a 4.999 asalariados",
      minEmployees: 1000,
      maxEmployees: 4999,
      isTotal: 0,
    },
    {
      name: "De 5.000 o más asalariados",
      minEmployees: 5000,
      maxEmployees: null,
      isTotal: 0,
    },
  ];

  for (const bucket of employeeBucketsData) {
    await db
      .insert(buckets)
      .values(bucket)
      .onConflictDoUpdate({
        target: buckets.name,
        set: {
          minEmployees: bucket.minEmployees,
          maxEmployees: bucket.maxEmployees,
          isTotal: bucket.isTotal,
        },
      });
  }
}

export async function syncIneStats() {
  console.log("Starting INE Stats Sync...");
  await seedBuckets();

  // Seed Metadata for known tables
  await seedMetadata(
    73_020,
    "Empresas por CCAA (CNAE 855)",
    "Empresas por CCAA, actividad principal (855) y estrato de asalariados.",
    "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/73020"
  );
  await seedMetadata(
    294,
    "Locales por CCAA (CNAE 855)",
    "Locales por CCAA, actividad principal (855) y estrato de asalariados.",
    "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/294"
  );
  await seedMetadata(
    4721,
    "Empresas por municipio",
    "Empresas por municipio y actividad principal",
    "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721"
  );
  await seedMetadata(
    29_005,
    "Padrón por municipio",
    "Cifras oficiales del padrón por municipio",
    "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/29005"
  );

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
    console.log(
      `Processing Community: ${comm.idealistaName ?? comm.ineName}...`
    );
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

    // Improved matching logic:
    // The Nombre contains segments like "Nacional. Sin asalariados. Total. 855 Otra educación."
    // We try to match segments against our bucket names.
    const segments = row.Nombre.split(".").map((s) => s.trim());
    const bucket = bucketRows.find((b) => segments.includes(b.name));

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
  const muniRows = await db
    .select()
    .from(municipalities)
    .where(
      and(
        isNotNull(municipalities.ineId),
        isNotNull(municipalities.ineFkVariable)
      )
    );

  const munisToProcess = muniRows;

  console.log(
    `Found ${muniRows.length} INE municipalities with stats identifiers.`
  );

  const chunkSize = 10;
  for (let i = 0; i < munisToProcess.length; i += chunkSize) {
    const chunk = munisToProcess.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processMunicipality));

    if (i % 100 === 0) {
      console.log(
        `Processed ${i} / ${munisToProcess.length} municipalities...`
      );
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
    if (!Array.isArray(rows)) {
      return;
    }
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
