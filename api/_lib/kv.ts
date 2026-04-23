/**
 * Thin Upstash Redis wrapper using the REST API (no SDK required).
 * Set these env vars in Vercel:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd<T = unknown>(args: (string | number)[]): Promise<T | null> {
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upstash error ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as { result: T | null };
  return data.result;
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await cmd<string>(["GET", key]);
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await cmd(["SET", key, JSON.stringify(value)]);
}

export async function kvDel(key: string): Promise<void> {
  await cmd(["DEL", key]);
}
