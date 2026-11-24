// Sends real printed letters through Lob (lob.com). Costs money per letter on a live key.
//   POST /api/mail   body: { pin, letters: [ { leadId, to: { name, address_line1, address_city, address_state, address_zip }, html } ] }
// Needs two Netlify environment variables:
//   LOB_API_KEY  - from your Lob dashboard. A key starting with "test_" makes test letters that are never mailed.
//   MAIL_PIN     - a PIN you pick. The app asks for it before mailing, so nobody else who finds the site can spend your money.
import { readSettings } from "./settings.mjs";

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const access = process.env.ACCESS_KEY;
  if (access && req.headers.get("x-access-key") !== access) return json({ error: "unauthorized" }, 401);
  const lobKey = process.env.LOB_API_KEY, pin = process.env.MAIL_PIN;

  if (req.method === "GET") {
    return json({ enabled: !!(lobKey && pin), mode: lobKey ? (lobKey.startsWith("test_") ? "test" : "live") : null });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!lobKey) return json({ error: "Mailing isn't set up: add LOB_API_KEY in Netlify environment variables." }, 400);
  if (!pin) return json({ error: "Mailing is locked: add a MAIL_PIN in Netlify environment variables." }, 400);

  let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (String(body.pin || "") !== pin) return json({ error: "Wrong mail PIN." }, 403);
  const letters = Array.isArray(body.letters) ? body.letters : [];
  if (!letters.length) return json({ error: "No letters to send." }, 400);
  if (letters.length > 50) return json({ error: "Send at most 50 letters at a time." }, 400);

  const s = await readSettings();
  if (!s.addressLine1 || !s.city || !s.state || !s.zip) return json({ error: "Add your return address in Letter settings first." }, 400);
  const from = {
    name: (s.senderName || "").slice(0, 40), company: (s.company || "").slice(0, 40),
    address_line1: s.addressLine1, address_city: s.city, address_state: s.state, address_zip: s.zip,
  };
  const auth = "Basic " + Buffer.from(lobKey + ":").toString("base64");
  const mode = lobKey.startsWith("test_") ? "test" : "live";
  const results = [];
  for (const L of letters) {
    const t = L.to || {};
    if (!t.address_line1 || !t.address_city || !t.address_state || !t.address_zip) { results.push({ leadId: L.leadId, ok: false, error: "Recipient address is incomplete." }); continue; }
    try {
      const r = await fetch("https://api.lob.com/v1/letters", {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify({
          description: `Lead Finder ${L.leadId || ""}`.slice(0, 255),
          to: { name: String(t.name || "Current Resident").slice(0, 40), address_line1: t.address_line1, address_city: t.address_city, address_state: t.address_state, address_zip: t.address_zip, address_country: "US" },
          from, file: String(L.html || ""), color: false, use_type: "marketing", address_placement: "top_first_page",
          metadata: { leadId: String(L.leadId || "").slice(0, 400) },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) results.push({ leadId: L.leadId, ok: false, error: d?.error?.message || `Lob error ${r.status}` });
      else results.push({ leadId: L.leadId, ok: true, id: d.id, expected: d.expected_delivery_date || null });
    } catch (e) { results.push({ leadId: L.leadId, ok: false, error: String(e.message || e) }); }
  }
  return json({ mode, results });
};
export const config = { path: "/api/mail" };
