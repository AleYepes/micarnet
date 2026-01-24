import { syncDgtExams } from "./fetch-dgt-exams";
import { syncDgtSchools } from "./fetch-dgt-schools";
// import { syncGooglePlacesRaw } from "./fetch-google-places";
import { syncLocations } from "./fetch-ine-locations";
// import { syncIneStats } from "./fetch-ine-stats";
import { syncOsmBoundaries } from "./fetch-osm-boundaries";

async function main() {
  try {
    // 1. Sync Base Locations from INE
    console.log("\n--- Syncing INE Locations ---");
    await syncLocations();

    // // 2. Sync Stats from INE
    // console.log("\n--- Syncing INE Stats ---");
    // await syncIneStats();

    // 3. Sync OSM Boundaries (GeoJSON Blobs)
    console.log("\n--- Syncing OSM Boundaries ---");
    await syncOsmBoundaries({ reuseFiles: true });

    // 4. Sync DGT Schools
    console.log("\n--- Syncing DGT Schools ---");
    await syncDgtSchools();

    // 5. Sync DGT Exams
    console.log("\n--- Syncing DGT Exams ---");
    await syncDgtExams();

    // 6. Sync Google Places Raw Data
    // console.log("\n--- Syncing Google Places Raw ---");
    // await syncGooglePlacesRaw();
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

main();
