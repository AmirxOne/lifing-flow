import { cookies } from "next/headers";
import { ok } from "@/server/http";
import { SESSION_COOKIE, destroySession } from "@/server/auth/session";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token).catch(() => {});
  const res = ok({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const dynamic = "force-dynamic";
