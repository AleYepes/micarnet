import { env } from "@micarnet/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema/auth";

import * as locations from "./schema/locations";
import * as schools from "./schema/schools";
import { todo } from "./schema/todo";

export const schema = {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
  todo,
  ...locations,
  ...schools,
};

export const db = drizzle(env.DATABASE_URL, { schema });
