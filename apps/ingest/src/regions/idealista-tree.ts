export interface IdealistaTreeNode {
  children?: IdealistaTreeNode[];
  id: string;
  level?: string;
  name?: string;
  text?: string;
}

export interface IdealistaTreeEntry {
  level?: string;
  name?: string;
  parentSourceId: string | null;
  sourceId: string;
}

export function flattenIdealistaTree(
  nodes: IdealistaTreeNode[]
): IdealistaTreeEntry[] {
  const entries: IdealistaTreeEntry[] = [];

  function walk(items: IdealistaTreeNode[], parentSourceId: string | null) {
    for (const item of items) {
      entries.push({
        sourceId: item.id,
        parentSourceId,
        ...(item.level ? { level: item.level } : {}),
        ...(item.name || item.text ? { name: item.name ?? item.text } : {}),
      });

      if (item.children) {
        walk(item.children, item.id);
      }
    }
  }

  walk(nodes, null);
  return entries;
}
