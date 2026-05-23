import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function getAuthEnv(runtimeEnv = process.env) {
  return createEnv({
    server: {
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.url(),
      CORS_ORIGIN: z.url(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
