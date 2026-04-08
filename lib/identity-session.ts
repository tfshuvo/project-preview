import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export const ADORABLE_IDENTITY_COOKIE = "adorable_identity_id";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const getOrCreateIdentitySession = async () => {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ADORABLE_IDENTITY_COOKIE)?.value;

  if (existing) {
    return {
      identityId: existing,
    };
  }

  const identityId = randomUUID();

  cookieStore.set(ADORABLE_IDENTITY_COOKIE, identityId, {
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
  });

  return { identityId };
};
