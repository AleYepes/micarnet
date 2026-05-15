import { db } from "@micarnet/db";
import {
  comarcas,
  communities,
  municipalities,
  provinces,
} from "@micarnet/db/schema/locations";
import axios from "axios";
import { and, eq, isNull } from "drizzle-orm";

const INE_API_BASE = "https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE";

interface IneVariableValue {
  Id: number;
  FK_Variable: number;
  Nombre: string;
  Codigo: string;
  FK_JerarquiaPadres?: number[];
}

function expectReturnedId(
  row: { id: number } | undefined,
  label: string
): number {
  if (!row) {
    throw new Error(`Expected ${label} upsert to return an id`);
  }
  return row.id;
}

async function fetchIneVariable(
  variableId: number
): Promise<IneVariableValue[]> {
  const response = await axios.get<IneVariableValue[]>(
    `${INE_API_BASE}/${variableId}`
  );
  return response.data;
}

export async function syncLocations() {
  console.log("Fetching communities...");
  const rawCommunities = await fetchIneVariable(70);
  const communityIneIdToDbId = new Map<number, number>();

  const communitiesToInsert = rawCommunities
    .filter((c) => c.Codigo && c.Codigo.length === 2 && c.FK_JerarquiaPadres)
    .map((c) => ({
      ineId: c.Id,
      ineCode: c.Codigo,
      ineName: c.Nombre,
      ineFkVariable: c.FK_Variable,
      ineFkJerarquiaPadres: c.FK_JerarquiaPadres,
    }));

  console.log(`Syncing ${communitiesToInsert.length} communities...`);
  for (const community of communitiesToInsert) {
    const [row] = await db
      .insert(communities)
      .values(community)
      .onConflictDoUpdate({
        target: communities.ineId,
        set: {
          ineCode: community.ineCode,
          ineName: community.ineName,
          ineFkVariable: community.ineFkVariable,
          ineFkJerarquiaPadres: community.ineFkJerarquiaPadres,
        },
      })
      .returning({ id: communities.id });
    communityIneIdToDbId.set(
      community.ineId,
      expectReturnedId(row, "community")
    );
  }

  console.log("Fetching provinces...");
  const rawProvinces = await fetchIneVariable(20);
  const provinceIneIdToDbId = new Map<number, number>();
  const provinceDbIdToName = new Map<number, string>();

  const provincesToInsert = rawProvinces
    .filter((p) => {
      const isProvince = p.Codigo && p.Codigo.length === 2;
      const hasParent = p.FK_JerarquiaPadres?.some((id) =>
        communityIneIdToDbId.has(id)
      );
      return isProvince && hasParent;
    })
    .map((p) => {
      const communityIneId = p.FK_JerarquiaPadres?.find((id) =>
        communityIneIdToDbId.has(id)
      );
      if (!communityIneId) {
        throw new Error(`Province ${p.Nombre} has no valid community parent`);
      }
      const communityId = communityIneIdToDbId.get(communityIneId);
      if (!communityId) {
        throw new Error(
          `Community DB ID not found for INE ID ${communityIneId}`
        );
      }
      return {
        communityId,
        ineId: p.Id,
        ineCode: p.Codigo,
        ineName: p.Nombre,
        ineFkVariable: p.FK_Variable,
        ineFkJerarquiaPadres: p.FK_JerarquiaPadres,
      };
    });

  console.log(`Syncing ${provincesToInsert.length} provinces...`);
  for (const province of provincesToInsert) {
    const [row] = await db
      .insert(provinces)
      .values(province)
      .onConflictDoUpdate({
        target: provinces.ineId,
        set: {
          communityId: province.communityId,
          ineCode: province.ineCode,
          ineName: province.ineName,
          ineFkVariable: province.ineFkVariable,
          ineFkJerarquiaPadres: province.ineFkJerarquiaPadres,
        },
      })
      .returning({ id: provinces.id });
    const provinceId = expectReturnedId(row, "province");
    provinceIneIdToDbId.set(province.ineId, provinceId);
    provinceDbIdToName.set(provinceId, province.ineName);
  }

  console.log("Fetching comarcas...");
  const rawComarcas = await fetchIneVariable(953);
  const comarcaIneIdToDbId = new Map<number, number>();
  const fallbackComarcaByProvinceId = new Map<number, number>();

  const comarcasToInsert = rawComarcas
    .filter((c) => {
      const isComarca = c.Codigo && c.Codigo.length === 4;
      const hasProvince = c.FK_JerarquiaPadres?.some((id) =>
        provinceIneIdToDbId.has(id)
      );
      return isComarca && hasProvince;
    })
    .map((c) => {
      const provinceIneId = c.FK_JerarquiaPadres?.find((id) =>
        provinceIneIdToDbId.has(id)
      );
      if (!provinceIneId) {
        throw new Error(`Comarca ${c.Nombre} has no valid province parent`);
      }
      const provinceId = provinceIneIdToDbId.get(provinceIneId);
      if (!provinceId) {
        throw new Error(`Province DB ID not found for INE ID ${provinceIneId}`);
      }
      return {
        provinceId,
        ineId: c.Id,
        ineCode: c.Codigo,
        ineName: c.Nombre.trim(),
        ineFkVariable: c.FK_Variable,
        ineFkJerarquiaPadres: c.FK_JerarquiaPadres,
      };
    });

  console.log(`Syncing ${comarcasToInsert.length} comarcas...`);
  for (const comarca of comarcasToInsert) {
    const [row] = await db
      .insert(comarcas)
      .values(comarca)
      .onConflictDoUpdate({
        target: comarcas.ineId,
        set: {
          provinceId: comarca.provinceId,
          ineCode: comarca.ineCode,
          ineName: comarca.ineName,
          ineFkVariable: comarca.ineFkVariable,
          ineFkJerarquiaPadres: comarca.ineFkJerarquiaPadres,
        },
      })
      .returning({ id: comarcas.id });
    comarcaIneIdToDbId.set(comarca.ineId, expectReturnedId(row, "comarca"));
  }

  async function getFallbackComarcaId(provinceId: number) {
    const cached = fallbackComarcaByProvinceId.get(provinceId);
    if (cached) {
      return cached;
    }

    const ineName =
      provinceDbIdToName.get(provinceId) ?? `Province ${provinceId}`;
    const existing = await db
      .select({ id: comarcas.id })
      .from(comarcas)
      .where(
        and(
          eq(comarcas.provinceId, provinceId),
          eq(comarcas.ineName, ineName),
          isNull(comarcas.ineId),
          isNull(comarcas.idealistaShortUri)
        )
      )
      .limit(1);
    if (existing[0]) {
      fallbackComarcaByProvinceId.set(provinceId, existing[0].id);
      return existing[0].id;
    }

    const [row] = await db
      .insert(comarcas)
      .values({
        provinceId,
        ineName,
      })
      .returning({ id: comarcas.id });
    const comarcaId = expectReturnedId(row, "fallback comarca");
    fallbackComarcaByProvinceId.set(provinceId, comarcaId);
    return comarcaId;
  }

  console.log("Fetching municipalities...");
  const rawMunicipalities = await fetchIneVariable(19);

  const rawMunicipalitiesToInsert = rawMunicipalities.filter((m) => {
    const isMunicipality = m.Codigo && m.Codigo.length === 5;
    const notDeleted = !m.Nombre.startsWith(
      "Población en municipios desaparecidos"
    );
    const hasProvince = m.FK_JerarquiaPadres?.some((id) =>
      provinceIneIdToDbId.has(id)
    );
    return isMunicipality && notDeleted && hasProvince;
  });

  console.log(`Syncing ${rawMunicipalitiesToInsert.length} municipalities...`);
  const municipalitiesToInsert: (typeof municipalities.$inferInsert)[] = [];
  for (const m of rawMunicipalitiesToInsert) {
    const provinceIneId = m.FK_JerarquiaPadres?.find((id) =>
      provinceIneIdToDbId.has(id)
    );
    if (!provinceIneId) {
      throw new Error(`Municipality ${m.Nombre} has no valid province parent`);
    }
    const provinceId = provinceIneIdToDbId.get(provinceIneId);
    if (!provinceId) {
      throw new Error(`Province DB ID not found for INE ID ${provinceIneId}`);
    }
    const comarcaIneId = m.FK_JerarquiaPadres?.find((id) =>
      comarcaIneIdToDbId.has(id)
    );
    const comarcaId = comarcaIneId
      ? comarcaIneIdToDbId.get(comarcaIneId)
      : await getFallbackComarcaId(provinceId);

    if (!comarcaId) {
      throw new Error(`Comarca DB ID not found for ${m.Nombre}`);
    }

    municipalitiesToInsert.push({
      provinceId,
      comarcaId,
      ineId: m.Id,
      ineCode: m.Codigo,
      ineName: m.Nombre.trim(),
      ineFkVariable: m.FK_Variable,
      ineFkJerarquiaPadres: m.FK_JerarquiaPadres,
    });
  }

  const chunkSize = 100;
  for (let i = 0; i < municipalitiesToInsert.length; i += chunkSize) {
    const chunk = municipalitiesToInsert.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((m) =>
        db
          .insert(municipalities)
          .values(m)
          .onConflictDoUpdate({
            target: municipalities.ineId,
            set: {
              provinceId: m.provinceId,
              comarcaId: m.comarcaId,
              ineCode: m.ineCode,
              ineName: m.ineName,
              ineFkVariable: m.ineFkVariable,
              ineFkJerarquiaPadres: m.ineFkJerarquiaPadres,
            },
          })
      )
    );
    if (i % 1000 === 0) {
      console.log(`Processed ${i} municipalities...`);
    }
  }

  console.log("Location sync complete.");
}
