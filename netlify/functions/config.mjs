// Returns browser-side settings (Google Maps key for Street View photos). Locked by the same ACCESS_KEY.
export default async (req) => {
  const ok = process.env.ACCESS_KEY && req.headers.get("x-access-key") === process.env.ACCESS_KEY;
  if (!ok) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ streetViewKey: process.env.GOOGLE_MAPS_KEY || "" }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
export const config = { path: "/api/config" };
