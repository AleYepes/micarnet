import { expect, test } from "vitest";

import { validateRegionObservations } from "./validate-region-observations";

test("reports invalid in-memory Idealista Source Observations before rebuild", () => {
  const validation = validateRegionObservations([
    {
      sourceId: "duplicate",
      parentSourceId: null,
      name: "First",
    },
    {
      sourceId: "duplicate",
      parentSourceId: null,
      name: "Second",
    },
    {
      sourceId: "missing-name",
      parentSourceId: null,
      name: "",
    },
    {
      sourceId: "missing-parent",
      parentSourceId: "absent",
      name: "Missing parent",
    },
    {
      sourceId: "cycle-a",
      parentSourceId: "cycle-b",
      name: "Cycle A",
    },
    {
      sourceId: "cycle-b",
      parentSourceId: "cycle-a",
      name: "Cycle B",
    },
    {
      sourceId: "invalid-geometry",
      parentSourceId: null,
      name: "Invalid geometry",
      geometry: {
        type: "Polygon",
        coordinates: [[[-3.7, 40.4]]],
      },
    },
  ]);

  expect(validation).toEqual({
    isValid: false,
    rowCount: 7,
    assignableCount: 0,
    groupingCount: 6,
    errors: expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate_source_id",
        sourceId: "duplicate",
      }),
      expect.objectContaining({
        code: "missing_name",
        sourceId: "missing-name",
      }),
      expect.objectContaining({
        code: "missing_parent",
        sourceId: "missing-parent",
      }),
      expect.objectContaining({
        code: "parent_cycle",
        sourceId: "cycle-a",
      }),
      expect.objectContaining({
        code: "invalid_geometry",
        sourceId: "invalid-geometry",
      }),
    ]),
  });
});
