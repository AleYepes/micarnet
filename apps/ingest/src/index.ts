import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { regionIngestRuns, regions } from "@micarnet/db/schema/regions";
import { getDatabaseEnv } from "@micarnet/env/database";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { runIdealistaRegionIngest } from "./regions/run-idealista-region-ingest";

const envPaths = [
  fileURLToPath(new URL("../.env", import.meta.url)),
  fileURLToPath(new URL("../../../.env", import.meta.url)),
];

async function main() {
  loadIngestEnv();
  parseArgs(process.argv.slice(2));
  const db = createIngestDb();
  const summary = await runIdealistaRegionIngest({ db });

  console.log(`Fetched: ${summary.fetchedAt}`);
  console.log(`Rows: ${summary.validation.rowCount}`);
  console.log(`Assignable Regions: ${summary.validation.assignableCount}`);
  console.log(`Grouping Regions: ${summary.validation.groupingCount}`);
  console.log(`Validation errors: ${summary.validation.errors.length}`);
  console.log(
    `Rebuilt ${summary.rebuild.regionCount} ${summary.rebuild.source} Regions`
  );
}

function createIngestDb() {
  let env: ReturnType<typeof getDatabaseEnv>;
  try {
    env = getDatabaseEnv();
  } catch (cause) {
    throw new Error(
      `Missing DATABASE_URL for Idealista Region ingest. Set it in the shell environment or one of: ${envPaths.join(
        ", "
      )}`,
      { cause }
    );
  }

  return drizzle({
    client: createClient({ url: env.DATABASE_URL }),
    schema: { regions, regionIngestRuns },
  });
}

function loadIngestEnv() {
  for (const path of envPaths) {
    config({ path, quiet: true });
  }
}

function parseArgs(args: string[]) {
  const [area] = args;
  if (area !== "idealista-regions") {
    throw new Error(
      `Unknown ingest area '${area ?? ""}'. Expected idealista-regions.`
    );
  }

  if (args.length > 1) {
    throw new Error(
      "Invalid arguments for idealista-regions: this command fetches Idealista source data directly and accepts no --input path."
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown ingest command failure.");
  }
  process.exitCode = 1;
});
