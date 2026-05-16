import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { z } from "zod";

import { decodeIdealistaSourceObservation } from "./idealista-geometry";

const fixtureSchema = z.object({
  sourceId: z.string(),
  parentSourceId: z.string().nullable(),
  name: z.string().optional(),
  rawGeometry: z.string(),
});

test("decodes a single encoded Idealista path into a staged Source Observation polygon", async () => {
  const fixture = fixtureSchema.parse(
    JSON.parse(
      await readFile(
        new URL("./fixtures/idealista-single-ring-path.json", import.meta.url),
        "utf8"
      )
    )
  );

  const observation = decodeIdealistaSourceObservation(fixture);

  expect(observation).toEqual({
    sourceId: "single-ring",
    parentSourceId: "parent-region",
    name: "Single Ring",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-120.2, 38.5],
          [-120.95, 40.7],
          [-126.453, 43.252],
          [-120.2, 38.5],
        ],
      ],
    },
  });
});

test("decodes multiple encoded Idealista rings into a staged Source Observation multipolygon", async () => {
  const fixture = fixtureSchema.parse(
    JSON.parse(
      await readFile(
        new URL("./fixtures/idealista-multi-ring-path.json", import.meta.url),
        "utf8"
      )
    )
  );

  const observation = decodeIdealistaSourceObservation(fixture);

  expect(observation).toEqual({
    sourceId: "multi-ring",
    parentSourceId: null,
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-120.2, 38.5],
            [-120.95, 40.7],
            [-126.453, 43.252],
            [-120.2, 38.5],
          ],
        ],
        [
          [
            [-120.2, 38.5],
            [-120.95, 40.7],
            [-126.453, 43.252],
            [-120.2, 38.5],
          ],
        ],
      ],
    },
  });
});

test("preserves an already closed Idealista ring without adding a duplicate point", () => {
  const observation = decodeIdealistaSourceObservation({
    sourceId: "closed-ring",
    parentSourceId: null,
    rawGeometry: "((_p~iF~ps|U_ulLnnqC_mqNvxq`@~b_\\ghde@))",
  });

  expect(observation.geometry).toEqual({
    type: "Polygon",
    coordinates: [
      [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
        [-120.2, 38.5],
      ],
    ],
  });
});
