import { createClient } from "@libsql/client";
import { env } from "@micarnet/env/server";
import { drizzle } from "drizzle-orm/libsql";

import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema/auth.ts";
import {
  regionIngestRuns,
  regionRelations,
  regions,
} from "./schema/regions.ts";

export function createDb() {
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
