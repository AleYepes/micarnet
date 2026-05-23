import { decodeIdealistaSourceObservation } from "./idealista-geometry";
import type { IdealistaTreeEntry } from "./idealista-tree";
import type { UncheckedIdealistaRegionObservation } from "./validate-region-observations";

export interface IdealistaRegionLabel {
  level?: string;
  name?: string;
  parentName?: string;
  total?: number;
}

export function buildIdealistaRegionObservations({
  labelsBySourceId,
  rawGeometryBySourceId,
  treeEntries,
}: {
  labelsBySourceId: Map<string, IdealistaRegionLabel>;
  rawGeometryBySourceId: Map<string, string>;
  treeEntries: IdealistaTreeEntry[];
}): UncheckedIdealistaRegionObservation[] {
  return treeEntries.map((entry) => {
    const label = labelsBySourceId.get(entry.sourceId);
    const rawGeometry = rawGeometryBySourceId.get(entry.sourceId);
    const decoded = decodeIdealistaSourceObservation({
      sourceId: entry.sourceId,
      parentSourceId: entry.parentSourceId,
      name: label?.name ?? entry.name ?? "",
      rawGeometry,
    });
    const level = label?.level ?? entry.level;

    return {
      sourceId: decoded.sourceId,
      parentSourceId: decoded.parentSourceId,
      name: decoded.name ?? "",
      ...(level ? { level } : {}),
      ...(decoded.geometry ? { geometry: decoded.geometry } : {}),
    };
  });
}
