// import { syncLocations } from "./fetch-ine-locations";
import { syncIneStats } from "./fetch-ine-stats";

async function main() {
  console.log("MiCarnet Worker starting...");
  try {
    // await syncLocations();
    await syncIneStats();
    console.log("All sync tasks completed successfully.");
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

main();
