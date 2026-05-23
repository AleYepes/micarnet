import { expect, test } from "vitest";

import { buildIdealistaRegionObservations } from "./idealista-observations";

test("builds minimal Idealista Region Source Observations from tree labels and paths", () => {
  const observations = buildIdealistaRegionObservations({
    labelsBySourceId: new Map([
      [
        "spain",
        {
          name: "Espana",
          parentName: "ignored",
          total: 999,
        },
      ],
      [
        "madrid",
        {
          name: "Madrid",
          total: 123,
        },
      ],
    ]),
    rawGeometryBySourceId: new Map([
      ["madrid", "((_p~iF~ps|U_ulLnnqC_mqNvxq`@))"],
    ]),
    treeEntries: [
      {
        sourceId: "spain",
        parentSourceId: null,
      },
      {
        sourceId: "madrid",
        parentSourceId: "spain",
        level: "province",
      },
    ],
  });

  expect(observations).toEqual([
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "Espana",
    },
    {
      sourceId: "madrid",
      parentSourceId: "spain",
      name: "Madrid",
      level: "province",
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
    },
  ]);
});
