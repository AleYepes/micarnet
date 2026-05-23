import { createDb } from "@micarnet/db";
import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "@micarnet/db/schema/auth";
import { getAuthEnv } from "@micarnet/env/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export function createAuth() {
  const db = createDb();
  const env = getAuthEnv();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",

      schema: {
        account,
        accountRelations,
        session,
        sessionRelations,
        user,
        userRelations,
        verification,
      },
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export const auth = createAuth();
