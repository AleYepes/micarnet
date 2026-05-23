import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

import { createIdealistaClient } from "./idealista-client";

test("fetches Idealista tree labels and paths with explicit source URLs", async () => {
  const fetch = vi.fn((url: string) => {
    if (url === "https://mt1.idealista.com/11/tree/all-es-tree.json") {
      return Promise.resolve(
        jsonResponse([{ id: "spain", children: [{ id: "madrid" }] }])
      );
    }

    if (
      url ===
      "https://www.idealista.com/es/multizoneSearcherLocationTotals?locationShortUris=spain,madrid&operation=1&typology=1"
    ) {
      return Promise.resolve(
        jsonResponse({
          spain: { name: "Espana", total: 1000 },
          madrid: { name: "Madrid", parentName: "Espana", total: 100 },
        })
      );
    }

    if (url === "https://mt1.idealista.com/11/paths/es/spain") {
      return Promise.resolve(textResponse("", { status: 404 }));
    }

    if (url === "https://mt1.idealista.com/11/paths/es/madrid") {
      return Promise.resolve(textResponse("((_p~iF~ps|U_ulLnnqC_mqNvxq`@))"));
    }

    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
  const client = createIdealistaClient({ fetch });

  await expect(client.fetchTree()).resolves.toEqual([
    { id: "spain", children: [{ id: "madrid" }] },
  ]);
  await expect(client.fetchLabels(["spain", "madrid"])).resolves.toEqual(
    new Map([
      ["spain", { name: "Espana", total: 1000 }],
      ["madrid", { name: "Madrid", parentName: "Espana", total: 100 }],
    ])
  );
  await expect(
    client.fetchPathGeometries(["spain", "madrid"])
  ).resolves.toEqual(new Map([["madrid", "((_p~iF~ps|U_ulLnnqC_mqNvxq`@))"]]));
});

test("adds status source ID and phase context when an Idealista path fetch fails", async () => {
  const fetch = vi.fn(() =>
    Promise.resolve(textResponse("blocked", { status: 403 }))
  );
  const client = createIdealistaClient({ fetch });

  await expect(client.fetchPathGeometries(["madrid"])).rejects.toThrow(
    "phase=path sourceId=madrid status=403"
  );
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function textResponse(value: string, init?: ResponseInit) {
  return new Response(value, init);
}

test("loads labels from a local file if IDEALISTA_LABELS_FILE is configured", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "idealista-client-test-"));
  const tempFile = join(tempDir, "labels.json");
  await writeFile(
    tempFile,
    JSON.stringify({
      spain: { name: "Espana", total: 1000 },
      madrid: { name: "Madrid", parentName: "Espana", total: 100 },
    }),
    "utf8"
  );

  const originalEnv = process.env.IDEALISTA_LABELS_FILE;
  process.env.IDEALISTA_LABELS_FILE = tempFile;

  try {
    const client = createIdealistaClient();
    const labels = await client.fetchLabels(["spain", "madrid"]);
    expect(labels).toEqual(
      new Map([
        ["spain", { name: "Espana", total: 1000 }],
        ["madrid", { name: "Madrid", parentName: "Espana", total: 100 }],
      ])
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.IDEALISTA_LABELS_FILE;
    } else {
      process.env.IDEALISTA_LABELS_FILE = originalEnv;
    }
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("aborts subsequent and pending path fetches when a 403 status is returned", async () => {
  const urlsFetched: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    urlsFetched.push(url);
    if (url.includes("madrid")) {
      return textResponse("blocked", { status: 403 });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    return textResponse("ok");
  });

  const client = createIdealistaClient({ fetch, pathConcurrency: 2 });

  await expect(
    client.fetchPathGeometries(["madrid", "barcelona", "valencia"])
  ).rejects.toThrow("status=403");

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(urlsFetched).not.toContain(
    "https://mt1.idealista.com/11/paths/es/valencia"
  );
});

test("aborts subsequent label batches when a 403 status is returned", async () => {
  const urlsFetched: string[] = [];
  const fetch = vi.fn((url: string) => {
    urlsFetched.push(url);
    if (url.includes("madrid")) {
      return Promise.resolve(textResponse("blocked", { status: 403 }));
    }
    return Promise.resolve(
      jsonResponse({
        barcelona: { name: "Barcelona", total: 200 },
      })
    );
  });

  const client = createIdealistaClient({ fetch, labelBatchSize: 1 });

  await expect(
    client.fetchLabels(["madrid", "barcelona", "valencia"])
  ).rejects.toThrow("status=403");

  expect(urlsFetched.length).toBe(1);
  expect(urlsFetched[0]).toContain("locationShortUris=madrid");
});
