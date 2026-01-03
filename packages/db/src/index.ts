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
};

export const db = drizzle(env.DATABASE_URL, { schema });
