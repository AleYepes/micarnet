import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { getAuthEnv } from "./auth";
import { getDatabaseEnv } from "./database";

const runtimeEnv = process.env;

const nodeEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv,
  emptyStringAsUndefined: true,
});

export const env = {
  ...getDatabaseEnv(runtimeEnv),
  ...getAuthEnv(runtimeEnv),
  ...nodeEnv,
};
