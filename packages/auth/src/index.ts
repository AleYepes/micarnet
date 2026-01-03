import { db } from "@micarnet/db";
import { account, session, user, verification } from "@micarnet/db/schema/auth";
import { env } from "@micarnet/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: {
      account,
      session,
      user,
      verification,
    },
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
});
