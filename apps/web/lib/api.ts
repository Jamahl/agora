const BASE = (typeof window !== "undefined")
  ? ""
  : (process.env.API_URL || "http://localhost:8000");

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = (typeof window !== "undefined" ? "/api" : BASE) + path;
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body?.detail || body?.message || JSON.stringify(body);
    } catch {}
    throw new Error(`${res.status}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiServer<T = any>(path: string, cookieHeader?: string): Promise<T> {
  const url = BASE + path;
  const headers: Record<string, string> = {};
  if (cookieHeader) headers["cookie"] = cookieHeader;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
