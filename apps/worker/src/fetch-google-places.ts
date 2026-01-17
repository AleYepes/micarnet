import { db } from "@micarnet/db";
import { googlePlacesResponses, schools } from "@micarnet/db/schema/schools";
import { env } from "@micarnet/env/server";
import axios from "axios";
import { eq, isNull } from "drizzle-orm";
import stringSimilarity from "string-similarity";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.photos",
  "places.addressComponents",
  "places.viewport",
  "places.plusCode",
  "places.types",
  "places.googleMapsUri",
  "places.utcOffsetMinutes",
  "places.adrFormatAddress",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.reviews",
  "places.generativeSummary",
  "places.editorialSummary",
  "places.paymentOptions",
  "places.parkingOptions",
  "places.accessibilityOptions",
].join(",");

interface GooglePlace {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  businessStatus: string;
  types: string[];
  [key: string]: unknown;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Calculates a match score between 0 and 1.
 */
function calculateScore(
  dgtName: string,
  dgtLat: number,
  dgtLng: number,
  candidate: GooglePlace
): number {
  // 1. Name Similarity (40%)
  const nameSim = stringSimilarity.compareTwoStrings(
    normalize(dgtName),
    normalize(candidate.displayName.text)
  );

  // 2. Geo-Distance (30%)
  // Haversine-ish simple distance for small radii
  const latDiff = dgtLat - candidate.location.latitude;
  const lngDiff = dgtLng - candidate.location.longitude;
  const distKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111; // Approx
  let geoScore = 0;
  if (distKm < 0.05) {
    geoScore = 1; // < 50m
  } else if (distKm < 0.5) {
    geoScore = 1 - distKm / 0.5; // Linear drop to 500m
  }

  // 3. Type Validation (Bonus/Penalty)
  let typeScore = 0.3;
  if (candidate.types?.includes("driving_school")) {
    typeScore = 1;
  }

  const totalScore = nameSim * 0.4 + geoScore * 0.3 + typeScore * 0.3;
  return totalScore;
}

async function searchGooglePlace(school: typeof schools.$inferSelect) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set");
  }

  const query = `${school.dgtName} autoescuela ${school.dgtAddress}, ${school.dgtMunicipality}`;

  try {
    const response = await axios.post(
      PLACES_API_URL,
      {
        textQuery: query,
        locationBias:
          school.dgtLatitude && school.dgtLongitude
            ? {
                circle: {
                  center: {
                    latitude: school.dgtLatitude,
                    longitude: school.dgtLongitude,
                  },
                  radius: 500.0,
                },
              }
            : undefined,
        languageCode: "es",
        maxResultCount: 5,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": FIELD_MASK,
        },
      }
    );

    const candidates = (response.data.places as GooglePlace[]) || [];

    if (candidates.length === 0) {
      return { status: "NOT_FOUND", rawData: response.data, score: 0 };
    }

    // Score candidates
    const scored = candidates
      .map((c) => ({
        candidate: c,
        score:
          school.dgtLatitude && school.dgtLongitude
            ? calculateScore(
                school.dgtName || "",
                school.dgtLatitude,
                school.dgtLongitude,
                c
              )
            : 0.5, // Neutral if no geo data
      }))
      .filter((s) => s.candidate.businessStatus !== "CLOSED_PERMANENTLY")
      .sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (!best || best.score < 0.7) {
      return {
        status: scored.length > 1 ? "MULTIPLE_CANDIDATES" : "NOT_FOUND",
        rawData: response.data,
        score: best?.score || 0,
      };
    }

    return {
      status: "MATCHED",
      placeId: best.candidate.id,
      rawData: best.candidate, // We store the best matching object as the raw truth
      score: best.score,
      fullResponse: response.data, // Option to store everything
    };
  } catch (error) {
    console.error(
      `Error searching Google Places for DGT ID ${school.dgtId}:`,
      error
    );
    throw error;
  }
}

export async function syncGooglePlacesRaw() {
  console.log("Starting Google Places Raw Sync...");

  if (!env.GOOGLE_MAPS_API_KEY) {
    console.error("Skipping: GOOGLE_MAPS_API_KEY is missing.");
    return;
  }

  // Find schools that don't have a record in google_places_responses yet
  const pendingSchools = await db
    .select()
    .from(schools)
    .leftJoin(
      googlePlacesResponses,
      eq(schools.dgtId, googlePlacesResponses.dgtId)
    )
    .where(isNull(googlePlacesResponses.id));

  console.log(`Found ${pendingSchools.length} schools pending Google sync.`);

  for (const { schools: school } of pendingSchools) {
    if (!school.dgtId) {
      continue;
    }

    console.log(`Processing ${school.dgtName} (${school.dgtId})...`);

    try {
      const result = await searchGooglePlace(school);

      await db
        .insert(googlePlacesResponses)
        .values({
          dgtId: school.dgtId,
          placeId: result.placeId,
          rawData: result.rawData,
          status: result.status,
          matchConfidence: result.score,
        })
        .onConflictDoUpdate({
          target: googlePlacesResponses.dgtId,
          set: {
            placeId: result.placeId,
            rawData: result.rawData,
            status: result.status,
            matchConfidence: result.score,
            fetchedAt: new Date(),
          },
        });

      // Optional: Add a small delay to respect rate limits if needed
      // await new Promise(resolve => setTimeout(resolve, 100));
    } catch (_e) {
      console.error(`Failed to sync ${school.dgtId}, skipping.`);
    }
  }

  console.log("Google Places Raw Sync Complete.");
}
