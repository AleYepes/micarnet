import {
  createIdealistaClient,
  type IdealistaClient,
} from "./idealista-client";
import { buildIdealistaRegionObservations } from "./idealista-observations";
import { flattenIdealistaTree } from "./idealista-tree";
import { rebuildRegions } from "./rebuild-regions";
import { validateRegionObservations } from "./validate-region-observations";

export async function runIdealistaRegionIngest({
  client = createIdealistaClient(),
  db,
  fetchedAt = new Date(),
}: {
  client?: IdealistaClient;
  // biome-ignore lint/suspicious/noExplicitAny: generic database client support
  db: any;
  fetchedAt?: Date;
}) {
  const tree = await client.fetchTree();
  const treeEntries = flattenIdealistaTree(tree);
  const sourceIds = treeEntries.map((entry) => entry.sourceId);
  const [labelsBySourceId, rawGeometryBySourceId] = await Promise.all([
    client.fetchLabels(sourceIds),
    client.fetchPathGeometries(sourceIds),
  ]);
  const observations = buildIdealistaRegionObservations({
    labelsBySourceId,
    rawGeometryBySourceId,
    treeEntries,
  });
  const validation = validateRegionObservations(observations);

  if (!validation.isValid) {
    throw new Error(
      `Cannot run Idealista Region ingest: invalid observations fetchedAt=${fetchedAt.toISOString()} errors=${JSON.stringify(
        validation.errors
      )}`
    );
  }

  const rebuild = await rebuildRegions({
    db,
    fetchedAt,
    observations,
  });

  return {
    fetchedAt: fetchedAt.toISOString(),
    rebuild,
    validation,
  };
}
