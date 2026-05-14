import { db } from "@micarnet/db";
import {
  comarcas,
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
  // 1. Communities (Variable 70)
  console.log("Fetching communities...");
  const rawCommunities = await fetchIneVariable(70);
  const communityIneIdToCode = new Map<number, string>(); // INE ID -> Codigo (string)

  const communitiesToInsert = rawCommunities
    .filter((c) => c.Codigo && c.Codigo.length === 2 && c.FK_JerarquiaPadres)
    .map((c) => {
      communityIneIdToCode.set(c.Id, c.Codigo);
      return {
        id: Number.parseInt(c.Codigo, 10),
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
        target: communities.id,
        set: {
          name: community.name,
          ineId: community.ineId,
          ineFkVariable: community.ineFkVariable,
          ineFkJerarquiaPadres: community.ineFkJerarquiaPadres,
        },
      });
  }

  // 2. Provinces (Variable 20)
  console.log("Fetching provinces...");
  const rawProvinces = await fetchIneVariable(20);
  const provinceIneIdToCode = new Map<number, string>(); // INE ID -> Codigo (string)

  const provincesToInsert = rawProvinces
    .filter((p) => {
      const isProvince = p.Codigo && p.Codigo.length === 2;
      const hasParent = p.FK_JerarquiaPadres?.some((id) =>
        communityIneIdToCode.has(id)
      );
      return isProvince && hasParent;
    })
    .map((p) => {
      const communityIneId = p.FK_JerarquiaPadres?.find((id) =>
        communityIneIdToCode.has(id)
      );
      if (!communityIneId) {
        throw new Error(`Province ${p.Nombre} has no valid community parent`);
      }
      const communityCodeStr = communityIneIdToCode.get(communityIneId);
      if (!communityCodeStr) {
        throw new Error(
          `Community Code not found for INE ID ${communityIneId}`
        );
      }
      const communityId = Number.parseInt(communityCodeStr, 10);
      provinceIneIdToCode.set(p.Id, p.Codigo);
      return {
        id: Number.parseInt(p.Codigo, 10),
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
        target: provinces.id,
        set: {
          name: province.name,
          communityId: province.communityId,
          ineId: province.ineId,
          ineFkVariable: province.ineFkVariable,
          ineFkJerarquiaPadres: province.ineFkJerarquiaPadres,
        },
      });
  }

  // 3. Comarcas (Variable 953)
  console.log("Fetching comarcas...");
  const rawComarcas = await fetchIneVariable(953);
  const comarcaIneIdToCode = new Map<number, string>(); // INE ID -> Codigo (string)

  const comarcasToInsert = rawComarcas
    .filter((c) => {
      const isComarca = c.Codigo && c.Codigo.length === 4;
      const hasProvince = c.FK_JerarquiaPadres?.some((id) =>
        provinceIneIdToCode.has(id)
      );
      return isComarca && hasProvince;
    })
    .map((c) => {
      const provinceIneId = c.FK_JerarquiaPadres?.find((id) =>
        provinceIneIdToCode.has(id)
      );
      if (!provinceIneId) {
        throw new Error(`Comarca ${c.Nombre} has no valid province parent`);
      }
      const provinceCodeStr = provinceIneIdToCode.get(provinceIneId);
      if (!provinceCodeStr) {
        throw new Error(`Province Code not found for INE ID ${provinceIneId}`);
      }
      const provinceId = Number.parseInt(provinceCodeStr, 10);
      comarcaIneIdToCode.set(c.Id, c.Codigo);
      return {
        id: Number.parseInt(c.Codigo, 10),
        name: c.Nombre.trim(),
        provinceId,
        ineId: c.Id,
        ineFkVariable: c.FK_Variable,
        ineFkJerarquiaPadres: c.FK_JerarquiaPadres,
        isPlaceholder: false,
        isDerived: false,
        searchable: true,
      };
    });

  console.log(`Syncing ${comarcasToInsert.length} comarcas...`);
  for (const comarca of comarcasToInsert) {
    await db
      .insert(comarcas)
      .values(comarca)
      .onConflictDoUpdate({
        target: comarcas.id,
        set: {
          name: comarca.name,
          provinceId: comarca.provinceId,
          ineId: comarca.ineId,
          ineFkVariable: comarca.ineFkVariable,
          ineFkJerarquiaPadres: comarca.ineFkJerarquiaPadres,
          isPlaceholder: false,
          isDerived: false,
          searchable: true,
        },
      });
  }

  console.log("Creating placeholder comarcas for each province...");
  for (const province of provincesToInsert) {
    await db
      .insert(comarcas)
      .values({
        id: -province.id,
        name: province.name,
        provinceId: province.id,
        isPlaceholder: true,
        isDerived: true,
        searchable: false,
      })
      .onConflictDoUpdate({
        target: comarcas.id,
        set: {
          name: province.name,
          provinceId: province.id,
          isPlaceholder: true,
          isDerived: true,
          searchable: false,
        },
      });
  }

  // 4. Municipalities (Variable 19)
  console.log("Fetching municipalities...");
  const rawMunicipalities = await fetchIneVariable(19);

  const municipalitiesToInsert = rawMunicipalities
    .filter((m) => {
      const isMunicipality = m.Codigo && m.Codigo.length === 5;
      const notDeleted = !m.Nombre.startsWith(
        "Población en municipios desaparecidos"
      );
      const hasProvince = m.FK_JerarquiaPadres?.some((id) =>
        provinceIneIdToCode.has(id)
      );
      return isMunicipality && notDeleted && hasProvince;
    })
    .map((m) => {
      const provinceIneId = m.FK_JerarquiaPadres?.find((id) =>
        provinceIneIdToCode.has(id)
      );
      if (!provinceIneId) {
        throw new Error(
          `Municipality ${m.Nombre} has no valid province parent`
        );
      }
      const provinceCodeStr = provinceIneIdToCode.get(provinceIneId);
      if (!provinceCodeStr) {
        throw new Error(`Province Code not found for INE ID ${provinceIneId}`);
      }
      const provinceId = Number.parseInt(provinceCodeStr, 10);
      const comarcaIneId = m.FK_JerarquiaPadres?.find((id) =>
        comarcaIneIdToCode.has(id)
      );
      const comarcaCodeStr = comarcaIneId
        ? comarcaIneIdToCode.get(comarcaIneId)
        : undefined;
      const comarcaId = comarcaCodeStr
        ? Number.parseInt(comarcaCodeStr, 10)
        : -provinceId;

      return {
        id: Number.parseInt(m.Codigo, 10),
        name: m.Nombre.trim(),
        provinceId,
        comarcaId,
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
            target: municipalities.id,
            set: {
              name: m.name,
              provinceId: m.provinceId,
              comarcaId: m.comarcaId,
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
