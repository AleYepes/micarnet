import {
  rebuildIdealistaRegionsFromArtifact,
  stageIdealistaHarvestArtifact,
} from "./regions/idealista-region-initialization";

type Command = "init" | "rebuild" | "stage";

interface ParsedArgs {
  artifactDir?: string;
  command: Command;
  inputPath?: string;
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));

  if (parsedArgs.command === "stage") {
    requireOption(parsedArgs.inputPath, "--input", parsedArgs.command);
    requireOption(parsedArgs.artifactDir, "--artifact-dir", parsedArgs.command);

    const summary = await stageIdealistaHarvestArtifact({
      artifactDir: parsedArgs.artifactDir,
      inputPath: parsedArgs.inputPath,
    });
    printStageSummary(summary);
    process.exitCode = summary.validation.isValid ? 0 : 1;
    return;
  }

  requireOption(parsedArgs.artifactDir, "--artifact-dir", parsedArgs.command);
  const { createDb } = await import("@micarnet/db");
  const db = createDb();

  if (parsedArgs.command === "rebuild") {
    const rebuildSummary = await rebuildIdealistaRegionsFromArtifact({
      artifactDir: parsedArgs.artifactDir,
      db,
    });
    console.log(
      `Rebuilt ${rebuildSummary.regionCount} ${rebuildSummary.source} Regions`
    );
    console.log(`Artifact: ${parsedArgs.artifactDir}`);
    return;
  }

  requireOption(parsedArgs.inputPath, "--input", parsedArgs.command);
  const stageSummary = await stageIdealistaHarvestArtifact({
    artifactDir: parsedArgs.artifactDir,
    inputPath: parsedArgs.inputPath,
  });
  printStageSummary(stageSummary);

  if (!stageSummary.validation.isValid) {
    process.exitCode = 1;
    return;
  }

  const rebuildSummary = await rebuildIdealistaRegionsFromArtifact({
    artifactDir: parsedArgs.artifactDir,
    db,
  });
  console.log(
    `Rebuilt ${rebuildSummary.regionCount} ${rebuildSummary.source} Regions`
  );
}

function parseArgs(args: string[]): ParsedArgs {
  const [area, command] = args;
  if (area !== "idealista-regions") {
    throw new Error(
      `Unknown ingest area '${area ?? ""}'. Expected idealista-regions.`
    );
  }
  if (!(command === "init" || command === "rebuild" || command === "stage")) {
    throw new Error(
      `Unknown idealista-regions command '${command ?? ""}'. Expected stage, rebuild, or init.`
    );
  }

  const parsedArgs: ParsedArgs = { command };
  for (let index = 2; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];

    if (!(option && value)) {
      throw new Error(
        `Invalid arguments for idealista-regions ${command}: expected --input and/or --artifact-dir values.`
      );
    }

    if (option === "--input") {
      parsedArgs.inputPath = value;
      continue;
    }

    if (option === "--artifact-dir") {
      parsedArgs.artifactDir = value;
      continue;
    }

    throw new Error(
      `Unknown option '${option}' for idealista-regions ${command}. Expected --input or --artifact-dir.`
    );
  }

  return parsedArgs;
}

function requireOption(
  value: string | undefined,
  optionName: string,
  command: string
): asserts value is string {
  if (!value) {
    throw new Error(`Missing ${optionName} for idealista-regions ${command}.`);
  }
}

function printStageSummary(
  summary: Awaited<ReturnType<typeof stageIdealistaHarvestArtifact>>
) {
  console.log(`Imported: ${summary.importedFilePath}`);
  console.log(`Artifact: ${summary.artifactDir}`);
  console.log(`Rows: ${summary.validation.rowCount}`);
  console.log(`Assignable Regions: ${summary.validation.assignableCount}`);
  console.log(`Grouping Regions: ${summary.validation.groupingCount}`);
  console.log(`Validation errors: ${summary.validation.errors.length}`);

  for (const error of summary.validation.errors) {
    console.log(`- ${error.code}: ${error.message}`);
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
