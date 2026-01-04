import { db } from "@micarnet/db";
import { communities } from "@micarnet/db/schema/locations";
import { buckets, statsByCommunity } from "@micarnet/db/schema/stats";
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
  filter?: string
): Promise<IneDataRow[]> {
  let url = `${INE_DATOS_TABLA_BASE}/${tableId}`;
  if (filter) {
    // If filter already contains 'tv=', don't add it again
    const query = filter.startsWith("tv=") ? filter : `tv=${filter}`;
    url += `?${query}`;
  }
  const response = await axios.get<IneDataRow[]>(url);
  return response.data;
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

  // 1. Sync Community Stats (Companies 73020 & Locales 294)
  console.log("Syncing Community Stats (CNAE 855)...");
  for (const comm of commRows) {
    if (!(comm.ineId && comm.ineFkVariable)) continue;
    console.log(`Processing Community: ${comm.name}...`);

    const filterBase = `tv=338:18326&tv=${comm.ineFkVariable}:${comm.ineId}`;

    // Companies
    const companies = await fetchIneTable(73_020, filterBase);
    // Locales
    const locales = await fetchIneTable(294, filterBase);

    // Helper to extract bucket and year data
    const processRows = async (
      rows: IneDataRow[],
      type: "companies" | "locales"
    ) => {
      for (const row of rows) {
        const bucketLabel = row.Nombre.split(". ")[1]?.trim() || "Total";
        const bucket = bucketRows.find((b) =>
          bucketLabel.includes(b.label.replace("asalariados", "").trim())
        );
        if (!bucket) continue;

        for (const dp of row.Data) {
          if (dp.Anyo < 2020) continue;

          const update: any = {
            communityId: comm.id,
            employeeBucketId: bucket.id,
            year: dp.Anyo,
          };
          if (type === "companies") update.cnae855CompanyCount = dp.Valor;
          else update.cnae855LocaleCount = dp.Valor;

          await db
            .insert(statsByCommunity)
            .values(update)
            .onConflictDoUpdate({
              target: [
                statsByCommunity.communityId,
                statsByCommunity.employeeBucketId,
                statsByCommunity.year,
              ],
              set:
                type === "companies"
                  ? { cnae855CompanyCount: dp.Valor }
                  : { cnae855LocaleCount: dp.Valor },
            });
        }
      }
    };

    await processRows(companies, "companies");
    await processRows(locales, "locales");
  }

  // 2. Sync Municipality Stats (Population 29005 & Companies 4721)
  // For municipalities, we limit to the most recent year to avoid huge fetches
  // or we need a more targeted approach.
  console.log("Syncing Municipality Stats (Recent)...");
  // Implementation for municipalities would follow similar pattern but might need
  // to be more selective to avoid rate limits/timeouts due to 8000+ municipalities.

  console.log("INE Stats Sync Complete.");
}
