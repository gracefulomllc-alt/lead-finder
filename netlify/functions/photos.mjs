// House photos you take in the field.
//   POST   /api/photos?lead=<leadId>   body: raw JPEG/PNG/WebP bytes (the app shrinks photos to ~1600px first)  -> { key }
//   GET    /api/photos/<key>           -> the image
//   DELETE /api/photos/<key>
// Photos live in their own Netlify Blobs store; the list of a lead's photos is kept on the lead (field "photos").
import { getStore } from "@netlify/blobs";

const MAX = 4.5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req, context) => {
  const accessKey = Netlify.env.get("ACCESS_KEY");
  if (accessKey && req.method !== "GET" && req.headers.get("x-access-key") !== accessKey) return json({ error: "unauthorized" }, 401);
  const store = getStore({ name: "lead-photos", consistency: "strong" });
  const key = context.params?.key;

  if (req.method === "GET" && key) {
    const r = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return new Response("not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (req.method === "POST") {
    const lead = new URL(req.url).searchParams.get("lead") || "";
    if (!/^[a-z0-9-]{1,80}$/i.test(lead)) return json({ error: "lead id required" }, 400);
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!TYPES.includes(type)) return json({ error: "photos only (jpeg, png, webp)" }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > MAX) return json({ error: "photo too large" }, 413);
    const k = `${lead}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    await store.set(k, buf, { metadata: { type, lead, at: new Date().toISOString() } });
    return json({ key: k });
  }
  if (req.method === "DELETE" && key) { await store.delete(key); return json({ ok: true }); }
  return json({ error: "not found" }, 404);
};

export const config = { path: ["/api/photos", "/api/photos/:key"] };
