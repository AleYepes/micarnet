import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function getDatabaseEnv(runtimeEnv = process.env) {
  return createEnv({
    server: {
      DATABASE_URL: z.string().min(1),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
