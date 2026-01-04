import { env } from "@micarnet/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as auth from "./schema/auth";
import * as locations from "./schema/locations";
import * as schools from "./schema/schools";
import * as stats from "./schema/stats";

export const schema = {
  ...auth,
  ...locations,
  ...schools,
  ...stats,
};

export const db = drizzle(env.DATABASE_URL, { schema });
