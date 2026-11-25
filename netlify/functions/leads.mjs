// Lead Finder API — stores distressed-property leads in Netlify Blobs.
//   GET    /api/leads            -> { leads: [...] }
//   POST   /api/leads            -> body: { leads: [ {...}, ... ] }  (upsert; used by scanners / your agent app)
//   PATCH  /api/leads?id=<id>    -> body: { status?, notes?, lat?, lng?, ... }
//   DELETE /api/leads?id=<id>
// Open by default. If you set an ACCESS_KEY env var, every request then needs header  x-access-key: <ACCESS_KEY>
import { getStore } from "@netlify/blobs";
import seedLeads from "../lib/seed-leads.mjs";

const STORE = "lead-finder";
const KEY = "leads";
const STATUSES = ["New", "Reviewed", "Contacted", "Offer Made", "Dead"];
const FIELDS = [
  "amountOwed", "address", "city", "county", "zip", "leadType", "keyDate",
  "status", "estValue", "propertyType", "owner", "ownerMailing", "caseNumber",
  "sourceUrl", "notes", "lat", "lng", "lender", "taxOwed", "saved", "firstSeen", "amountOwedSource", "estValueSource", "phone", "lastLetter", "loanDate", "interestRate", "deal", "checklist", "payments", "hot", "email", "source", "letters", "comps", "portfolio", "sqft", "originalLoan", "nedDate", "balanceAsOf", "loanType", "holder", "ptStatus",
  "cureIntentDeadline", "cureDeadline", "cureTotal", "cureStatementDate", "lenderBid", "bankruptcy", "lienParties", "photos", "beds", "baths", "yearBuilt",
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function leadId(l) {
  if (l.id) return String(l.id);
  if (l.caseNumber) return `${norm(l.county)}-${norm(l.caseNumber)}`;
  return `${norm(l.county)}-${norm(l.address)}`;
}

const CITY_FIX = {
  "ft collins": "Fort Collins", "ft. collins": "Fort Collins", "berthud": "Berthoud", "berthhoud": "Berthoud",
  "colorado spgs": "Colorado Springs", "co spgs": "Colorado Springs", "coloardo springs": "Colorado Springs", "colo springs": "Colorado Springs",
  "fredrick": "Frederick", "la salle": "La Salle", "lasalle": "La Salle",
};
const fixCity = (c) => {
  const t = String(c || "").replace(/,+$/, "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  return CITY_FIX[t.toLowerCase()] || t.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
};

function clean(input) {
  const out = {};
  for (const f of FIELDS) if (input[f] !== undefined) out[f] = input[f];
  for (const n of ["amountOwed", "estValue", "taxOwed", "lat", "lng", "originalLoan", "sqft", "cureTotal", "lenderBid", "beds", "baths", "yearBuilt"]) {
    if (out[n] === "" || out[n] === null) out[n] = null;
    else if (out[n] !== undefined) {
      const v = Number(String(out[n]).replace(/[$,\s]/g, ""));
      out[n] = Number.isFinite(v) ? v : null;
    }
  }
  if (out.city !== undefined) out.city = fixCity(out.city);
  if (out.status && !STATUSES.includes(out.status)) delete out.status;
  if (out.saved !== undefined) out.saved = out.saved === true || out.saved === "true";
  if (out.hot !== undefined) out.hot = out.hot === true || out.hot === "true";
  for (const k of ["deal", "checklist"]) if (out[k] !== undefined && (typeof out[k] !== "object" || Array.isArray(out[k]) || JSON.stringify(out[k]).length > 8000)) delete out[k];
  for (const k of ["letters", "comps"]) if (out[k] !== undefined && (!Array.isArray(out[k]) || JSON.stringify(out[k]).length > 20000)) delete out[k];
  if (out.portfolio !== undefined && (typeof out.portfolio !== "object" || Array.isArray(out.portfolio))) delete out.portfolio;
  if (out.photos !== undefined && (!Array.isArray(out.photos) || out.photos.length > 200)) delete out.photos;
  if (out.lienParties !== undefined && (!Array.isArray(out.lienParties) || JSON.stringify(out.lienParties).length > 6000)) delete out.lienParties;
  if (out.payments !== undefined && (!Array.isArray(out.payments) || JSON.stringify(out.payments).length > 40000)) delete out.payments;
  if (out.interestRate !== undefined) { const r = Number(String(out.interestRate).replace(/[%\s]/g, "")); out.interestRate = Number.isFinite(r) && r > 0 && r < 30 ? r : null; }
  return out;
}

async function load(store) {
  const existing = await store.get(KEY, { type: "json" });
  if (existing) {
    // One-time upgrade for leads saved before accuracy tracking existed.
    const seedById = new Map(seedLeads.map((l) => [leadId(l), l]));
    let changed = false;
    for (const l of existing) {
      const sd = seedById.get(l.id);
      if (sd && !l.amountOwedSource && sd.amountOwedSource && l.amountOwed === sd.amountOwed) { l.amountOwedSource = sd.amountOwedSource; changed = true; }
      if (sd && !l.loanDate && sd.loanDate) { l.loanDate = sd.loanDate; changed = true; }
      if (typeof l.notes === "string" && l.notes.includes(" (719-545-0821)")) { l.notes = l.notes.replace(" (719-545-0821)", ""); changed = true; }
      if (l.city && fixCity(l.city) !== l.city) { l.city = fixCity(l.city); changed = true; }
    }
    if (changed) await store.setJSON(KEY, existing);
    return existing;
  }
  // First run ever: load the starter leads so the app isn't empty.
  const today = new Date().toISOString().slice(0, 10);
  const seeded = seedLeads.map((l) => ({ saved: false, ...clean(l), id: leadId(l), updatedAt: today }));
  await store.setJSON(KEY, seeded);
  return seeded;
}

export default async (req) => {
  // Optional lock: only enforced if an ACCESS_KEY environment variable is set in Netlify.
  const accessKey = process.env.ACCESS_KEY;
  if (accessKey && req.headers.get("x-access-key") !== accessKey) return json({ error: "unauthorized" }, 401);

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
    let added = 0, updated = 0, removed = 0;
    for (const raw of incoming) {
      if (!raw || (!raw.address && !raw.caseNumber)) continue;
      const c = clean(raw);
      const lid = leadId(raw);
      const prev = byId.get(lid);
      if (raw.remove) {
        // foreclosure is over (withdrawn, cured, sold, deeded): drop untouched leads, mark worked ones Dead
        if (prev && prev.status === "New" && !prev.hot && !prev.saved) { byId.delete(lid); removed++; }
        else if (prev && prev.status !== "Dead") { byId.set(lid, { ...prev, status: "Dead", ptStatus: c.ptStatus || prev.ptStatus, notes: `${prev.notes || ""}\nPublic Trustee status: ${c.ptStatus || "closed"} (${today}).`.trim(), updatedAt: today }); removed++; }
        continue;
      }
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
    return json({ added, updated, removed, total: all.length });
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
