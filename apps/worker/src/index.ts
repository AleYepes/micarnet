// import { syncLocations } from "./fetch-ine-locations";
// import { syncIneStats } from "./fetch-ine-stats";
import { syncOsmBoundaries } from "./fetch-osm-boundaries";

async function main() {
  console.log("MiCarnet Worker starting...");
  try {
    // // 1. Sync Base Locations from INE
    // console.log("\n--- Syncing INE Locations ---");
    // await syncLocations();

    // // 2. Sync Stats from INE
    // console.log("\n--- Syncing INE Stats ---");
    // await syncIneStats();

    // 3. Sync OSM Boundaries (GeoJSON Blobs)
    console.log("\n--- Syncing OSM Boundaries ---");
    await syncOsmBoundaries();

    console.log("\nAll sync tasks completed successfully.");
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

main();
