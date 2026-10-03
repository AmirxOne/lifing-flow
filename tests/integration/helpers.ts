// Integration helpers — real HTTP against the running dev server (:3300).
// Uses seed users; each suite creates its own throwaway data where needed.

const BASE = process.env.TEST_BASE ?? "http://localhost:3300";

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
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
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

/** Register a fresh user and return their session cookie. */
export async function registerUser(fullName: string, email: string, password = "Pass1234"): Promise<{ cookie: string; id: string }> {
  const res = await call<{ id: string }>("/api/auth/register", { method: "POST", json: { fullName, email, password } });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register failed ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const cookie = extractCookie(res.headers);
  if (!cookie) throw new Error("no session cookie after register");
  return { cookie, id: res.body.data!.id };
}

/** Login a seed user and return their session cookie. */
export async function loginUser(email: string, password = "Pass1234"): Promise<string> {
  const res = await call("/api/auth/login", { method: "POST", json: { email, password } });
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${JSON.stringify(res.body)}`);
  const cookie = extractCookie(res.headers);
  if (!cookie) throw new Error("no session cookie after login");
  return cookie;
}

function extractCookie(headers: Headers): string | null {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

/** Create an isolated household pair (owner+partner) with unique suffix. */
export async function makeHousehold(suffix: string): Promise<{ owner: { cookie: string; id: string }; partner: { cookie: string; id: string } }> {
  const owner = await registerUser(`مالک ${suffix}`, `it-owner-${suffix}@example.com`);
  await call("/api/household", { method: "POST", json: { name: `خانواده ${suffix}` } }, owner.cookie);
  const invite = await call<{ code: string }>("/api/household/invite", { method: "POST", json: {} }, owner.cookie);
  const partner = await registerUser(`همسر ${suffix}`, `it-partner-${suffix}@example.com`);
  await call("/api/household/join", { method: "POST", json: { code: invite.body.data!.code } }, partner.cookie);
  return { owner, partner };
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
