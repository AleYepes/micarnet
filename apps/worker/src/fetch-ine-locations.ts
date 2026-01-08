import { db } from "@micarnet/db";
import {
  communities,
  municipalities,
  provinces,
} from "@micarnet/db/schema/locations";
import axios from "axios";

const INE_API_BASE = "https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE";

interface IneVariableValue {
  Id: number;
  FK_Variable: number;
  Nombre: string;
  Codigo: string;
  FK_JerarquiaPadres?: number[];
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
  console.log("Starting location sync (with internal INE IDs)...");

  // 1. Communities (Variable 70)
  console.log("Fetching communities...");
  const rawCommunities = await fetchIneVariable(70);
  const communityMap = new Map<number, string>(); // INE ID -> Codigo

  const communitiesToInsert = rawCommunities
    .filter((c) => c.Codigo && c.Codigo.length === 2 && c.FK_JerarquiaPadres)
    .map((c) => {
      communityMap.set(c.Id, c.Codigo);
      return {
        code: c.Codigo,
        name: c.Nombre,
        ineId: c.Id,
        ineFkVariable: c.FK_Variable,
        ineFkJerarquiaPadres: c.FK_JerarquiaPadres,
      };
    });

  console.log(`Syncing ${communitiesToInsert.length} communities...`);
  for (const community of communitiesToInsert) {
    await db
      .insert(communities)
      .values(community)
      .onConflictDoUpdate({
        target: communities.code,
        set: {
          name: community.name,
          ineId: community.ineId,
          ineFkVariable: community.ineFkVariable,
          ineFkJerarquiaPadres: community.ineFkJerarquiaPadres,
        },
      });
  }

  // Fetch inserted communities to get integer IDs
  const insertedComms = await db.select().from(communities);
  const commIdMap = new Map<string, number>(); // code -> id
  for (const c of insertedComms) {
    commIdMap.set(c.code, c.id);
  }

  // 2. Provinces (Variable 20)
  console.log("Fetching provinces...");
  const rawProvinces = await fetchIneVariable(20);
  const provinceMap = new Map<number, string>(); // INE ID -> Codigo

  const provincesToInsert = rawProvinces
    .filter((p) => {
      const isProvince = p.Codigo && p.Codigo.length === 2;
      const hasParent = p.FK_JerarquiaPadres?.some((id) =>
        communityMap.has(id)
      );
      return isProvince && hasParent;
    })
    .map((p) => {
      const communityIneId = p.FK_JerarquiaPadres?.find((id) =>
        communityMap.has(id)
      );
      if (!communityIneId) {
        throw new Error(`Province ${p.Nombre} has no valid community parent`);
      }
      const communityCode = communityMap.get(communityIneId);
      if (!communityCode) {
        throw new Error(
          `Community Code not found for INE ID ${communityIneId}`
        );
      }
      const communityId = commIdMap.get(communityCode);
      if (communityId === undefined) {
        throw new Error(`Community ID not found for Code ${communityCode}`);
      }
      provinceMap.set(p.Id, p.Codigo);
      return {
        code: p.Codigo,
        name: p.Nombre,
        communityId,
        ineId: p.Id,
        ineFkVariable: p.FK_Variable,
        ineFkJerarquiaPadres: p.FK_JerarquiaPadres,
      };
    });

  console.log(`Syncing ${provincesToInsert.length} provinces...`);
  for (const province of provincesToInsert) {
    await db
      .insert(provinces)
      .values(province)
      .onConflictDoUpdate({
        target: provinces.code,
        set: {
          name: province.name,
          communityId: province.communityId,
          ineId: province.ineId,
          ineFkVariable: province.ineFkVariable,
          ineFkJerarquiaPadres: province.ineFkJerarquiaPadres,
        },
      });
  }

  // Fetch inserted provinces to get integer IDs
  const insertedProvs = await db.select().from(provinces);
  const provIdMap = new Map<string, number>(); // code -> id
  for (const p of insertedProvs) {
    provIdMap.set(p.code, p.id);
  }

  // 3. Municipalities (Variable 19)
  console.log("Fetching municipalities...");
  const rawMunicipalities = await fetchIneVariable(19);

  const municipalitiesToInsert = rawMunicipalities
    .filter((m) => {
      const isMunicipality = m.Codigo && m.Codigo.length === 5;
      const notDeleted = !m.Nombre.startsWith(
        "Población en municipios desaparecidos"
      );
      const hasProvince = m.FK_JerarquiaPadres?.some((id) =>
        provinceMap.has(id)
      );
      return isMunicipality && notDeleted && hasProvince;
    })
    .map((m) => {
      const provinceIneId = m.FK_JerarquiaPadres?.find((id) =>
        provinceMap.has(id)
      );
      if (!provinceIneId) {
        throw new Error(
          `Municipality ${m.Nombre} has no valid province parent`
        );
      }
      const provinceCode = provinceMap.get(provinceIneId);
      if (!provinceCode) {
        throw new Error(`Province Code not found for INE ID ${provinceIneId}`);
      }
      const provinceId = provIdMap.get(provinceCode);
      if (provinceId === undefined) {
        throw new Error(`Province ID not found for Code ${provinceCode}`);
      }
      return {
        code: m.Codigo,
        name: m.Nombre.trim(),
        provinceId,
        ineId: m.Id,
        ineFkVariable: m.FK_Variable,
        ineFkJerarquiaPadres: m.FK_JerarquiaPadres,
      };
    });

  console.log(`Syncing ${municipalitiesToInsert.length} municipalities...`);
  const chunkSize = 100;
  for (let i = 0; i < municipalitiesToInsert.length; i += chunkSize) {
    const chunk = municipalitiesToInsert.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((m) =>
        db
          .insert(municipalities)
          .values(m)
          .onConflictDoUpdate({
            target: municipalities.code,
            set: {
              name: m.name,
              provinceId: m.provinceId,
              ineId: m.ineId,
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
