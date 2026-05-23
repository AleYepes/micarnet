import { createClient } from "@libsql/client";
import { getDatabaseEnv } from "@micarnet/env/database";
import { drizzle } from "drizzle-orm/libsql";

import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema/auth";
import { regionIngestRuns, regionRelations, regions } from "./schema/regions";

export function createDb() {
  const env = getDatabaseEnv();
  const client = createClient({
    url: env.DATABASE_URL,
  });

  return drizzle({
    client,
    schema: {
      account,
      accountRelations,
      session,
      sessionRelations,
      user,
      userRelations,
      verification,
      regions,
      regionRelations,
      regionIngestRuns,
    },
  });
}

export const db = createDb();
