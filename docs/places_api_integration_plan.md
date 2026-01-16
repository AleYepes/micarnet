# Enhanced Google Places API (New) Integration Plan

## 1. Strategic Overview

This plan leverages the **Places API (New)** to transform the `schools` table from a raw government registry into a consumer-facing directory. We will utilize the API's granular field masking to manage costs while extracting high-value data points like accessibility, payment options, and generative AI summaries, which were not available in the legacy API.

### Core Philosophy

- **DGT is the Legal Truth**: The existence of a school is validated by the DGT registry.
- **Google is the Social Truth**: The reputation, exact entry point, and operational status are validated by Google Places.
- **Hybrid Geography**: We use OSM for precise polygon boundaries but use Google's address components to understand "colloquial" neighborhood names that users actually search for.

---

## 2. API Configuration & Field Strategy

We will use the **Text Search (New)** endpoint. Unlike the legacy API, the New API charges by "SKU" groups (Basic, Contact, Atmosphere). To avoid skyrocketing costs, we will use a specific Field Mask rather than `places.*`.

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`

### 2.1 Request Parameters

```json
{
  "textQuery": "{dgt_name} autoescuela {dgt_address}, {dgt_municipality}",
  "locationBias": {
    "circle": {
      "center": { "latitude": dgt_lat, "longitude": dgt_lng },
      "radius": 500.0
    }
  },
  "maxResultCount": 5,
  "languageCode": "es",
  "minRating": 0,
  "openNow": false
}
```

### 2.2 The "All-Features" Field Mask Strategy

We will request fields from all three SKU tiers to fully enrich the application.

| SKU Tier       | Fields Requested                                                                                                                                          | Application Usage                                                                                       |
| :------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **Basic**      | `id`, `displayName`, `formattedAddress`, `location`, `photos`, `addressComponents`, `viewport`, `plusCode`                                                | Core mapping, address validation, neighborhood linking.                                                 |
| **Advanced**   | `googleMapsUri`, `utcOffsetMinutes`, `adrFormatAddress`, `businessStatus`                                                                                 | SEO links, timezone correction for open hours, precise parsing.                                         |
| **Contact**    | `nationalPhoneNumber`, `internationalPhoneNumber`, `websiteUri`, `regularOpeningHours`                                                                    | User contact actions (Call/Visit).                                                                      |
| **Atmosphere** | `priceLevel`, `rating`, `userRatingCount`, `reviews`, `generativeSummary`, `editorialSummary`, `paymentOptions`, `parkingOptions`, `accessibilityOptions` | **Rich UX**: Filtering by "Wheelchair accessible", "Credit Card accepted", and displaying AI summaries. |

---

## 3. Database Schema Updates

We need to expand the schema to accommodate complex objects (like opening hours and accessibility) and new API features (like AI summaries).

### 3.1 `packages/db/src/schema/schools.ts`

```typescript
// Existing fields...
// New Google Places Enrichment Fields

// Identity & Status
googlePlaceId: text("google_place_id").unique(),
businessStatus: text("business_status"), // OPERATIONAL, CLOSED_TEMPORARILY, etc.
placeUri: text("place_uri"), // Link to Google Maps

// Spatial (Used for Map Camera & UX)
googleViewport: jsonb("google_viewport"), // { low: {lat, lng}, high: {lat, lng} }
plusCode: jsonb("plus_code"), // { globalCode, compoundCode }

// Atmosphere & Ratings
rating: doublePrecision("rating"),
userRatingCount: integer("user_rating_count"),
priceLevel: text("price_level"), // PRICE_LEVEL_INEXPENSIVE, etc.

// Rich Content
photos: jsonb("photos"), // Array of { name (resource), width, height, authorAttributions }
reviews: jsonb("reviews"), // Store top 5 relevant reviews (text, rating, author, time)
generativeSummary: jsonb("generative_summary"), // The new AI overview text provided by Google
accessibilityOptions: jsonb("accessibility_options"), // e.g., ["wheelchairAccessibleEntrance", "wheelchairAccessibleRestroom"]
paymentOptions: jsonb("payment_options"), // e.g., ["google_pay", "credit_cards"]
parkingOptions: jsonb("parking_options"), // e.g., ["free_parking_lot"]

// Contact & Operations
websiteUri: text("website_uri"),
nationalPhoneNumber: text("national_phone_number"),
regularOpeningHours: jsonb("regular_opening_hours"), // Complex object with periods and weekdayText

// Sync Meta
lastGoogleSync: timestamp("last_google_sync"),
googleMatchConfidence: doublePrecision("google_match_confidence"), // Score 0-1
```

### 3.2 `packages/db/src/schema/locations.ts` (Neighborhoods)

We need to support "Point-based" neighborhoods for Google entries that don't match OSM polygons.

```typescript
// Refined Neighborhoods Table
osmId: bigint("osm_id"), // Nullable now
googlePlaceId: text("google_place_id").unique(), // For neighborhoods found via API
type: text("type").default("ADMINISTRATIVE"), // 'ADMINISTRATIVE' (OSM) or 'COLLOQUIAL' (Google)
googleViewport: jsonb("google_viewport"), // Vital for colloquial neighborhoods that lack polygons
```

---

## 4. Implementation Logic: `apps/worker`

### 4.1 The `RefineSchoolsPlaces` Job

#### Step 1: Intelligent Matching (The "Fuzzy" Logic)

We cannot trust DGT coordinates blindly (some are manually entered or reference a city center).

1. **Fetch Candidate**: Get result list from API.
2. **Scoring System**:
   - **Name Similarity (40%)**: Jaro-Winkler distance between `dgt_name` and `places.displayName`.
   - **Geo-Distance (30%)**: Haversine distance. If < 50m, score 100%. If > 500m, score drops rapidly.
   - **Strict Filtering**: Reject if `businessStatus` is `CLOSED_PERMANENTLY`.
   - **Type Validation**: Bonus points if `types` includes `driving_school`.
3. **Threshold**: Only accept match if Score > 0.75.

#### Step 2: Deduplication Logic

DGT often lists the same school multiple times (e.g., for different license classes A, B, C) as separate rows. Google usually has one Place ID for the physical location.

- **Check**: Before saving `googlePlaceId`, check if it exists in DB.
- **Action**:
  - If exists: Identify the "Master" record (usually the one with Class B).
  - Link secondary records to the Master via a new `parentId` or `mergedIds` column, OR simply allow duplicates but flag them. _Recommendation: Allow shared `googlePlaceId` but render them as a stacked card in the UI._

#### Step 3: Geographic Refinement (Address Components)

Google returns an `addressComponents` array. We iterate through it to refine the `neighborhoodId`.

1. **Extract**: Look for `neighborhood`, `sublocality_level_1`, or `sublocality_level_2`.
2. **OSM Reconciliation**:
   - Take the extracted name (e.g., "Chamberí").
   - Query DB: `SELECT * FROM neighborhoods WHERE name ILIKE 'Chamberí' AND municipality_id = X`.
   - **Hit**: Update `schools.neighborhoodId` to this OSM ID.
   - **Miss**: Create a new `neighborhood` record:
     - `name`: "Chamberí"
     - `type`: "COLLOQUIAL"
     - `googlePlaceId`: The ID of the neighborhood component (if provided by separate lookup) or derive from context.
     - _Note_: Since `addressComponents` don't give the neighborhood's Place ID directly, we might need a secondary `placeDetails` call for the neighborhood _only if_ we want to store it permanently. Alternatively, store the string in a `google_neighborhood_name` column on the school for simplicity.

### 4.2 Handling Rich Assets

1. **Photos**:
   - Do **not** download photos to blob storage immediately (saves bandwidth).
   - Store the `photoReference` string and the `name` (resource path).
   - The Frontend will proxy the image request: `https://places.googleapis.com/v1/{name}/media?key=API_KEY`.
2. **Reviews**:
   - Store the `reviews` array in JSONB.
   - Front-end can display "Latest Reviews" directly from DB without re-querying Google.

---

## 5. Cost Analysis & Batching Strategy

The Field Mask usage above corresponds to **Essentials + Pro + Enterprise + Atmosphere**. This is the highest cost tier.

### Optimization Strategy

1. **Seeding Phase (High Cost)**:
   - Run the full script _once_ for all schools.
   - Estimated: 8,000 requests \* $0.03 (approx blended rate) = ~$240.
2. **Maintenance Phase (Low Cost)**:
   - Only query `Basic` + `Contact` fields for daily updates (checking if open/closed).
   - Only re-fetch `Atmosphere` (Reviews/Photos) once every 30-90 days per school.
3. **Dry Run**:
   - Implement `npm run job:refine-places -- --dry-run` to log matches and calculated costs without calling the API (mocking) or without writing to DB.

## 6. UX Integration (The "Why")

How this data manifests in the Web App:

1. **Search**: Users can filter by "Open Now", "Accepts Credit Card", or "Wheelchair Accessible" (using the JSONB columns).
2. **Map**: When clicking a school, use `googleViewport` to animate the map camera to the perfect bounding box (better than a fixed zoom level).
3. **Details**:
   - Display the **Generative Summary** at the top of the profile ("_Highly rated school in Madrid known for patient instructors..._").
   - Display a "Payment Methods" badge cluster.
   - Show "Popular Times" (derived from existing review distribution if available, or just Opening Hours).

## 7. Execution Plan

1. **Schema Migration**: Run Drizzle migrations for `schools` and `neighborhoods`.
2. **Worker Logic**: Implement `refine-schools-places.ts` with the 3-tier scoring logic.
3. **Seeding**: Run the worker in batches of 50 with a 2-second sleep to monitor quota.
4. **Validation**: Manually review matches with `googleMatchConfidence` between 0.75 and 0.85.
5. **Frontend**: Update the School Card component to render the new rich data.
