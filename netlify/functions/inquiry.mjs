// Public form on /sell: a homeowner asks to be contacted. Creates a "hot" lead in the app.
// Always open (even if ACCESS_KEY is set), with a honeypot field and a simple hourly cap against spam.
import { getStore } from "@netlify/blobs";
import seedLeads from "../lib/seed-leads.mjs";
import { leadId } from "./leads.mjs";

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const str = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: bots fill hidden fields
  const name = str(b.name, 80), phone = str(b.phone, 30), email = str(b.email, 120), address = str(b.address, 160);
  if (!name || (!phone && !email) || !address) return json({ error: "Please add your name, a phone or email, and the property address." }, 400);
  if (!b.consent) return json({ error: "Please check the box so we can contact you." }, 400);

  const store = getStore({ name: "lead-finder", consistency: "strong" });
  const now = new Date(), hour = now.toISOString().slice(0, 13);
  const meter = (await store.get("inquiry-meter", { type: "json" })) || {};
  if (meter.hour === hour && meter.n >= 25) return json({ error: "Too many requests right now. Please call or try again later." }, 429);
  await store.setJSON("inquiry-meter", { hour, n: meter.hour === hour ? meter.n + 1 : 1 });

  const m = address.match(/^(.+?),\s*([^,]+?),?\s+(?:CO|Colorado)\.?\s+(\d{5})/i);
  const today = now.toISOString().slice(0, 10);
  const lead = {
    id: "inbound-" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
    address: m ? m[1].trim() : address, city: m ? m[2].trim() : "", zip: m ? m[3] : "",
    owner: name, phone, email, leadType: "Inbound", status: "New", hot: true, saved: true, source: "Seller page" + (b.ref ? ` (letter ${str(b.ref, 60)})` : ""),
    notes: [`Reached out via seller page ${today}.`, b.behind && `Months behind: ${str(b.behind, 20)}.`, b.goal && `Wants: ${str(b.goal, 60)}.`,
      b.balance && `Says loan balance about: ${str(b.balance, 20)}.`, b.payment && `Says monthly payment about: ${str(b.payment, 20)}.`,
      b.message && `Message: ${str(b.message, 1200)}`].filter(Boolean).join("\n"),
    firstSeen: today, updatedAt: today,
  };
  // If they came from one of your letters, attach to that lead instead of making a new one.
  const leads = (await store.get("leads", { type: "json" })) || seedLeads.map((l) => ({ saved: false, ...l, id: leadId(l), updatedAt: today }));
  const ref = str(b.ref, 120), i = ref ? leads.findIndex((l) => l.id === ref) : -1;
  if (i >= 0) {
    const l = leads[i];
    Object.assign(l, { hot: true, saved: true, phone: phone || l.phone, email: email || l.email, status: "Contacted",
      notes: ((l.notes || "") + "\n🔥 " + lead.notes).trim(), updatedAt: today, source: lead.source });
  } else leads.push(lead);
  await store.setJSON("leads", leads);
  return json({ ok: true });
};
export const config = { path: "/api/inquiry" };
