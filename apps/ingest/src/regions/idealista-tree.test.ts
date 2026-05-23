import { expect, test } from "vitest";

import { flattenIdealistaTree } from "./idealista-tree";

test("flattens a nested Idealista Region tree into source and parent source IDs", () => {
  const entries = flattenIdealistaTree([
    {
      id: "spain",
      text: "Espana",
      children: [
        {
          id: "madrid",
          text: "Madrid",
          children: [
            {
              id: "chamartin",
              text: "Chamartin",
            },
          ],
        },
      ],
    },
  ]);

  expect(entries).toEqual([
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "Espana",
    },
    {
      sourceId: "madrid",
      parentSourceId: "spain",
      name: "Madrid",
    },
    {
      sourceId: "chamartin",
      parentSourceId: "madrid",
      name: "Chamartin",
    },
  ]);
});
