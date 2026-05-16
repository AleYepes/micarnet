import type { RegionBoundary } from "@micarnet/db/schema/regions";

const ringMatcher = /\({2,}(.*?)\){2,}/g;
const ringSeparatorMatcher = /\)+\(+/;

export interface IdealistaGeometryInput {
  name?: string;
  parentSourceId: string | null;
  rawGeometry?: string;
  sourceId: string;
}

export interface StagedIdealistaSourceObservation {
  geometry?: RegionBoundary;
  name?: string;
  parentSourceId: string | null;
  sourceId: string;
}

type Coordinate = [number, number];

export function decodeIdealistaSourceObservation(
  input: IdealistaGeometryInput
): StagedIdealistaSourceObservation {
  const geometry = input.rawGeometry
    ? ringsToGeojsonGeometry(decodeIdealistaGeometry(input.rawGeometry))
    : undefined;

  return {
    sourceId: input.sourceId,
    parentSourceId: input.parentSourceId,
    ...(input.name ? { name: input.name } : {}),
    ...(geometry ? { geometry } : {}),
  };
}

function decodeIdealistaGeometry(rawGeometry: string) {
  const rings: Coordinate[][] = [];

  for (const match of rawGeometry.matchAll(ringMatcher)) {
    const encodedGroup = match[1];
    if (!encodedGroup) {
      continue;
    }

    for (const encodedRing of encodedGroup.split(ringSeparatorMatcher)) {
      if (!encodedRing) {
        continue;
      }

      const ring = closeRing(decodePolyline(encodedRing));
      if (ring.length > 0) {
        rings.push(ring);
      }
    }
  }

  return rings;
}

function decodePolyline(encoded: string) {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const latitudeDelta = decodePolylineValue(encoded, index);
    index = latitudeDelta.nextIndex;
    const longitudeDelta = decodePolylineValue(encoded, index);
    index = longitudeDelta.nextIndex;

    latitude += latitudeDelta.value;
    longitude += longitudeDelta.value;
    coordinates.push([longitude / 1e5, latitude / 1e5]);
  }

  return coordinates;
}

function decodePolylineValue(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;

  while (index < encoded.length) {
    const byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result += (byte % 32) * 2 ** shift;
    shift += 5;

    if (byte < 0x20) {
      const halved = Math.floor(result / 2);
      const value = result % 2 === 1 ? -halved - 1 : halved;
      return { value, nextIndex: index };
    }
  }

  throw new Error(
    `Cannot decode Idealista polyline: unterminated value at index=${startIndex}`
  );
}

function closeRing(ring: Coordinate[]) {
  const first = ring[0];
  const last = ring.at(-1);
  if (!(first && last)) {
    return ring;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function ringsToGeojsonGeometry(
  rings: Coordinate[][]
): RegionBoundary | undefined {
  if (rings.length === 0) {
    return;
  }

  const firstRing = rings[0];
  if (!firstRing) {
    return;
  }

  if (rings.length === 1) {
    return {
      type: "Polygon",
      coordinates: [firstRing],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: rings.map((ring) => [ring]),
  };
}
