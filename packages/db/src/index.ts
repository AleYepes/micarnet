import { env } from "@micarnet/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import { account, session, user, verification } from "./schema/auth";
import {
  communities,
  municipalities,
  neighborhoods,
  provinces,
} from "./schema/locations";
import {
  classes,
  conversations,
  examStats,
  instructors,
  messages,
  packages,
  schools,
  students,
} from "./schema/schools";
import {
  buckets,
  metadata,
  statsByCommunity,
  statsByMunicipality,
} from "./schema/stats";

export const schema = {
  // Auth
  account,
  session,
  user,
  verification,
  // Locations
  communities,
  municipalities,
  neighborhoods,
  provinces,
  // Schools
  classes,
  conversations,
  examStats,
  instructors,
  messages,
  packages,
  schools,
  students,
  // Stats
  buckets,
  metadata,
  statsByCommunity,
  statsByMunicipality,
};

export const db = drizzle(env.DATABASE_URL, { schema });
