// Integration helpers — real HTTP against the running dev server (:3300).
// Households come from DB fixtures (registration is closed in production);
// the invite-code join path is tested through the API itself.

import { fixtureHousehold } from "./db-fixtures";

const BASE = process.env.TEST_BASE ?? "http://localhost:3300";

declare global {
  // eslint-disable-next-line no-var
  var __lhXff: string | undefined;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: { ok: boolean; data?: T; error?: { message: string; code?: string } };
}

export async function call<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  cookie?: string,
): Promise<ApiResponse<T>> {
  const { json, ...rest } = init;
  // unique per-process client IP so the server's join/login rate limiter
  // doesn't accumulate failures across repeated test runs
  if (!globalThis.__lhXff) globalThis.__lhXff = `10.42.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "x-forwarded-for": globalThis.__lhXff,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let body: ApiResponse<T>["body"];
  try {
    body = await res.json();
  } catch {
    body = { ok: false, error: { message: `non-json (${res.status})` } };
  }
  return { status: res.status, headers: res.headers, body };
}

/** Login any fixture/seed user and return their session cookie. */
export async function loginUser(email: string, password = "Pass1234"): Promise<string> {
  const res = await call("/api/auth/login", { method: "POST", json: { email, password } });
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${JSON.stringify(res.body)}`);
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error("no session cookie after login");
  return cookie;
}

/** Create a partner account through the invite-code flow (production path). */
export async function joinViaInvite(code: string, fullName: string, email: string, password = "Pass1234"): Promise<{ cookie: string; id: string }> {
  const res = await call<{ id: string }>("/api/auth/join", { method: "POST", json: { code, fullName, email, password } });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`join failed ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error("no session cookie after join");
  return { cookie, id: res.body.data!.id };
}

/** Cookie-ready isolated household pair (DB fixture + real login). */
export async function makeHousehold(suffix: string): Promise<{ owner: { cookie: string; id: string }; partner: { cookie: string; id: string } }> {
  const fx = await fixtureHousehold(suffix);
  return {
    owner: { cookie: await loginUser(fx.owner.email), id: fx.owner.id },
    partner: { cookie: await loginUser(fx.partner.email), id: fx.partner.id },
  };
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
