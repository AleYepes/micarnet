// import { syncDgtExams } from "./fetch-dgt-exams";
// import { syncDgtSchools } from "./fetch-dgt-schools";
// import { syncGooglePlacesRaw } from "./fetch-google-places";
import { syncIdealistaRegions } from "./fetch-idealista-regions";
import { syncLocations } from "./fetch-ine-locations";

// import { syncIneStats } from "./fetch-ine-stats";

async function main() {
  try {
    console.log("\n--- Syncing INE Locations ---");
    await syncLocations();

    console.log("\n--- Syncing Idealista Regions ---");
    await syncIdealistaRegions();

    // console.log("\n--- Syncing INE Stats ---");
    // await syncIneStats();

    // console.log("\n--- Syncing DGT Schools ---");
    // await syncDgtSchools();

    // console.log("\n--- Syncing DGT Exams ---");
    // await syncDgtExams();

    // console.log("\n--- Syncing Google Places Raw ---");
    // await syncGooglePlacesRaw();
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

main();
