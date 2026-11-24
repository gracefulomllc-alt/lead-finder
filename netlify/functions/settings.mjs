// Your sender info for letters (name, company, phone, email, return address), shared across devices.
//   GET /api/settings   PUT /api/settings  body: { senderName, company, phone, email, addressLine1, city, state, zip }
import { getStore } from "@netlify/blobs";

export const DEFAULTS = {
  senderName: "Leslie", company: "Graceful OM LLC", phone: "", email: "",
  addressLine1: "", city: "", state: "CO", zip: "",
};
const KEYS = Object.keys(DEFAULTS);
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function readSettings() {
  const saved = await getStore({ name: "lead-finder", consistency: "strong" }).get("settings", { type: "json" });
  return { ...DEFAULTS, ...(saved || {}) };
}

export default async (req) => {
  const key = process.env.ACCESS_KEY;
  if (key && req.headers.get("x-access-key") !== key) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") return json({ settings: await readSettings() });
  if (req.method === "PUT") {
    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const next = await readSettings();
    for (const k of KEYS) if (body[k] !== undefined) next[k] = String(body[k]).slice(0, 120).trim();
    await getStore({ name: "lead-finder", consistency: "strong" }).setJSON("settings", next);
    return json({ settings: next });
  }
  return json({ error: "method not allowed" }, 405);
};
export const config = { path: "/api/settings" };
