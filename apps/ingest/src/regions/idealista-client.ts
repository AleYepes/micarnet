import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IdealistaRegionLabel } from "./idealista-observations";
import type { IdealistaTreeNode } from "./idealista-tree";

const defaultTreeUrl = "https://mt1.idealista.com/11/tree/all-es-tree.json";
const defaultPathUrlPrefix = "https://mt1.idealista.com/11/paths/es/";
const defaultLabelsUrl =
  "https://www.idealista.com/es/multizoneSearcherLocationTotals";
const defaultTimeoutMs = 30_000;
const defaultLabelBatchSize = 100;
const defaultPathConcurrency = 8;

type IdealistaFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface IdealistaClient {
  fetchLabels(sourceIds: string[]): Promise<Map<string, IdealistaRegionLabel>>;
  fetchPathGeometries(sourceIds: string[]): Promise<Map<string, string>>;
  fetchTree(): Promise<IdealistaTreeNode[]>;
}

export function createIdealistaClient({
  fetch = globalThis.fetch.bind(globalThis),
  labelBatchSize = defaultLabelBatchSize,
  pathConcurrency = defaultPathConcurrency,
  timeoutMs = defaultTimeoutMs,
}: {
  fetch?: IdealistaFetch;
  labelBatchSize?: number;
  pathConcurrency?: number;
  timeoutMs?: number;
} = {}): IdealistaClient {
  const clientAbortController = new AbortController();
  const onBlock = () => clientAbortController.abort();

  return {
    async fetchTree() {
      const response = await fetchWithContext({
        fetch,
        phase: "tree",
        timeoutMs,
        url: defaultTreeUrl,
        clientSignal: clientAbortController.signal,
        onBlock,
      });
      const payload: unknown = await response.json();
      return parseTree(payload);
    },

    async fetchLabels(sourceIds) {
      if (process.env.IDEALISTA_LABELS_FILE) {
        try {
          const raw = await readFile(process.env.IDEALISTA_LABELS_FILE, "utf8");
          const payload: unknown = JSON.parse(raw);
          return parseLabels(payload);
        } catch (error) {
          throw new Error(
            `Failed to load local Idealista labels from file=${process.env.IDEALISTA_LABELS_FILE}`,
            { cause: error }
          );
        }
      }

      const rootDir = fileURLToPath(new URL("../../../../", import.meta.url));
      const fallbackPaths = [
        join(rootDir, "docs/python-references/labels.json"),
        join(rootDir, "data/idealista_harvest/labels.json"),
        join(rootDir, "labels.json"),
      ];

      for (const filePath of fallbackPaths) {
        try {
          const raw = await readFile(filePath, "utf8");
          const payload: unknown = JSON.parse(raw);
          return parseLabels(payload);
        } catch {
          // Ignore and check next path
        }
      }

      const labels = new Map<string, IdealistaRegionLabel>();
      for (const batch of chunk(sourceIds, labelBatchSize)) {
        const url = `${defaultLabelsUrl}?locationShortUris=${batch
          .map((sourceId) => encodeURIComponent(sourceId))
          .join(",")}&operation=1&typology=1`;
        const response = await fetchWithContext({
          fetch,
          phase: "labels",
          timeoutMs,
          url,
          clientSignal: clientAbortController.signal,
          onBlock,
        });
        const payload: unknown = await response.json();
        for (const [sourceId, label] of parseLabels(payload)) {
          labels.set(sourceId, label);
        }
      }
      return labels;
    },

    async fetchPathGeometries(sourceIds) {
      const pairs = await mapConcurrent(
        sourceIds,
        pathConcurrency,
        async (sourceId) => {
          const url = `${defaultPathUrlPrefix}${encodeURIComponent(sourceId)}`;
          const response = await fetchWithContext({
            fetch,
            phase: "path",
            sourceId,
            timeoutMs,
            url,
            okStatuses: new Set([200, 404]),
            clientSignal: clientAbortController.signal,
            onBlock,
          });

          if (response.status === 404) {
            return;
          }

          return {
            sourceId,
            rawGeometry: await response.text(),
          };
        }
      );

      return new Map(
        pairs
          .filter((pair) => pair !== undefined)
          .map((pair) => [pair.sourceId, pair.rawGeometry])
      );
    },
  };
}

function getIdealistaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Referer: "https://www.idealista.com/",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  };

  if (process.env.IDEALISTA_USER_AGENT) {
    headers["User-Agent"] = process.env.IDEALISTA_USER_AGENT;
  } else {
    headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  }

  if (process.env.IDEALISTA_COOKIE) {
    headers.Cookie = process.env.IDEALISTA_COOKIE;
  }

  return headers;
}

function linkAbortSignals(
  target: AbortController,
  clientSignal?: AbortSignal
): () => void {
  if (!clientSignal) {
    return () => undefined;
  }
  if (clientSignal.aborted) {
    target.abort();
    return () => undefined;
  }
  const onAbort = () => target.abort();
  clientSignal.addEventListener("abort", onAbort);
  return () => {
    clientSignal.removeEventListener("abort", onAbort);
  };
}

async function fetchWithContext({
  fetch,
  okStatuses,
  phase,
  sourceId,
  timeoutMs,
  url,
  clientSignal,
  onBlock,
}: {
  fetch: IdealistaFetch;
  okStatuses?: Set<number>;
  phase: string;
  sourceId?: string;
  timeoutMs: number;
  url: string;
  clientSignal?: AbortSignal;
  onBlock?: () => void;
}) {
  if (clientSignal?.aborted) {
    throw new Error(
      `Cannot fetch Idealista Region data phase=${phase}${
        sourceId ? ` sourceId=${sourceId}` : ""
      } url=${url} (previously blocked)`
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const cleanupSignal = linkAbortSignals(controller, clientSignal);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: getIdealistaHeaders(),
    });

    if (response.status === 403 || response.status === 429) {
      onBlock?.();
    }

    const accepted = okStatuses?.has(response.status) ?? response.ok;
    if (!accepted) {
      throw new Error(
        `Cannot fetch Idealista Region data phase=${phase}${
          sourceId ? ` sourceId=${sourceId}` : ""
        } status=${response.status} url=${url}`
      );
    }
    return response;
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("Cannot fetch")) {
      throw cause;
    }
    throw new Error(
      `Cannot fetch Idealista Region data phase=${phase}${
        sourceId ? ` sourceId=${sourceId}` : ""
      } url=${url}`,
      { cause }
    );
  } finally {
    clearTimeout(timeout);
    cleanupSignal();
  }
}

function parseTree(payload: unknown): IdealistaTreeNode[] {
  if (!Array.isArray(payload)) {
    throw new Error(
      "Invalid Idealista tree response phase=tree: expected array"
    );
  }

  return payload.map((node) => parseTreeNode(node));
}

function parseTreeNode(payload: unknown): IdealistaTreeNode {
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("Invalid Idealista tree node phase=tree: missing id");
  }

  const childrenPayload = payload.children;
  const children = Array.isArray(childrenPayload)
    ? childrenPayload.map((child) => parseTreeNode(child))
    : undefined;

  return {
    id: payload.id,
    ...(typeof payload.level === "string" ? { level: payload.level } : {}),
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    ...(typeof payload.text === "string" ? { text: payload.text } : {}),
    ...(children ? { children } : {}),
  };
}

function parseLabels(payload: unknown) {
  const labels = new Map<string, IdealistaRegionLabel>();
  if (!isRecord(payload)) {
    throw new Error("Invalid Idealista labels response phase=labels");
  }

  for (const [sourceId, value] of Object.entries(payload)) {
    if (!isRecord(value)) {
      continue;
    }

    labels.set(sourceId, {
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(typeof value.parentName === "string"
        ? { parentName: value.parentName }
        : {}),
      ...(typeof value.level === "string" ? { level: value.level } : {}),
      ...(typeof value.total === "number" ? { total: value.total } : {}),
    });
  }

  return labels;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
) {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await task(item);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
