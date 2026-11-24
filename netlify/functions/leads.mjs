// Lead Finder API — stores distressed-property leads in Netlify Blobs.
//   GET    /api/leads            -> { leads: [...] }
//   POST   /api/leads            -> body: { leads: [ {...}, ... ] }  (upsert; used by scanners / your agent app)
//   PATCH  /api/leads?id=<id>    -> body: { status?, notes?, lat?, lng?, ... }
//   DELETE /api/leads?id=<id>
// Every request needs header:  x-access-key: <ACCESS_KEY env var>
import { getStore } from "@netlify/blobs";
import seedLeads from "../lib/seed-leads.mjs";

const STORE = "lead-finder";
const KEY = "leads";
const STATUSES = ["New", "Reviewed", "Contacted", "Offer Made", "Dead"];
const FIELDS = [
  "amountOwed", "address", "city", "county", "zip", "leadType", "keyDate",
  "status", "estValue", "propertyType", "owner", "ownerMailing", "caseNumber",
  "sourceUrl", "notes", "lat", "lng", "lender", "taxOwed", "saved", "firstSeen",
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function leadId(l) {
  if (l.id) return String(l.id);
  if (l.caseNumber) return `${norm(l.county)}-${norm(l.caseNumber)}`;
  return `${norm(l.county)}-${norm(l.address)}`;
}

function clean(input) {
  const out = {};
  for (const f of FIELDS) if (input[f] !== undefined) out[f] = input[f];
  for (const n of ["amountOwed", "estValue", "taxOwed", "lat", "lng"]) {
    if (out[n] === "" || out[n] === null) out[n] = null;
    else if (out[n] !== undefined) {
      const v = Number(String(out[n]).replace(/[$,\s]/g, ""));
      out[n] = Number.isFinite(v) ? v : null;
    }
  }
  if (out.status && !STATUSES.includes(out.status)) delete out.status;
  if (out.saved !== undefined) out.saved = out.saved === true || out.saved === "true";
  return out;
}

async function load(store) {
  const existing = await store.get(KEY, { type: "json" });
  if (existing) return existing;
  // First run ever: load the starter leads so the app isn't empty.
  const today = new Date().toISOString().slice(0, 10);
  const seeded = seedLeads.map((l) => ({ saved: false, ...clean(l), id: leadId(l), updatedAt: today }));
  await store.setJSON(KEY, seeded);
  return seeded;
}

export default async (req) => {
  const accessKey = process.env.ACCESS_KEY;
  if (!accessKey) return json({ error: "ACCESS_KEY env var not set on the site" }, 500);
  if (req.headers.get("x-access-key") !== accessKey) return json({ error: "unauthorized" }, 401);

  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (req.method === "GET") {
    return json({ leads: await load(store) });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const incoming = Array.isArray(body) ? body : body.leads;
    if (!Array.isArray(incoming)) return json({ error: "send { leads: [...] }" }, 400);
    const leads = await load(store);
    const byId = new Map(leads.map((l) => [l.id, l]));
    const today = new Date().toISOString().slice(0, 10);
    let added = 0, updated = 0;
    for (const raw of incoming) {
      if (!raw || (!raw.address && !raw.caseNumber)) continue;
      const c = clean(raw);
      const lid = leadId(raw);
      const prev = byId.get(lid);
      if (prev) {
        // keep the user's own pipeline status/notes unless the scanner marks it Dead
        const merged = { ...prev, ...c, id: lid, firstSeen: prev.firstSeen, updatedAt: today };
        if (c.status !== "Dead") merged.status = prev.status;
        if (prev.notes && c.notes && !prev.notes.includes(c.notes)) merged.notes = `${prev.notes}\n${c.notes}`;
        else merged.notes = prev.notes || c.notes || "";
        byId.set(lid, merged);
        updated++;
      } else {
        byId.set(lid, { status: "New", notes: "", ...c, id: lid, firstSeen: today, updatedAt: today });
        added++;
      }
    }
    const all = [...byId.values()];
    await store.setJSON(KEY, all);
    return json({ added, updated, total: all.length });
  }

  if (req.method === "PATCH") {
    if (!id) return json({ error: "id required" }, 400);
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const leads = await load(store);
    const i = leads.findIndex((l) => l.id === id);
    if (i < 0) return json({ error: "not found" }, 404);
    leads[i] = { ...leads[i], ...clean(body), id, updatedAt: new Date().toISOString().slice(0, 10) };
    await store.setJSON(KEY, leads);
    return json({ lead: leads[i] });
  }

  if (req.method === "DELETE") {
    if (!id) return json({ error: "id required" }, 400);
    const leads = (await load(store)).filter((l) => l.id !== id);
    await store.setJSON(KEY, leads);
    return json({ ok: true, total: leads.length });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/leads" };
