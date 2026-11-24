# Lead Finder

A private web app that lists distressed properties (pre-foreclosures and tax-delinquent properties) in Arvada (Jefferson Co.), Loveland (Larimer Co.), Pueblo (Pueblo Co.) and Colorado Springs (El Paso Co.). It sorts them by **amount owed, cheapest first**.

**Layout (Zillow-style):** **New** tab = scroll-through feed of unreviewed leads with one-tap Pass / Save / Contacted · **Search** tab = map with price-tag pins + listing cards (split screen on desktop, Map/List toggle on phone) · **Pipeline** board · **Add**.

**Features:** filters by city, lead type, property type and status · Pipeline board (New → Reviewed → Contacted → Offer Made → Dead) · Map with color-coded pins · Owner letter and door-script generator · Import (JSON or CSV) · CSV export · Notes on each lead.

## Deploy (GitHub → Netlify)

1. Create a new GitHub repo (for example `lead-finder`, **private**) and upload everything in this folder.
2. In Netlify, go to **Add new site → Import from Git**, pick the repo, and leave the build settings alone. `netlify.toml` already handles them.
3. *(Optional lock)* The app is open by default — no sign-in. To lock it later, add an `ACCESS_KEY` environment variable in Netlify; the app will then ask for it once per device.
4. *(Optional, for house photos)* Add `GOOGLE_MAPS_KEY` — a Google Maps API key with **Street View Static API** enabled. In Google Cloud, restrict it to HTTP referrer `https://YOUR-SITE.netlify.app/*`. Without it, cards show a clean placeholder.
5. Redeploy. Open the site, tap 🔑, and enter your key. The key is saved on that device.

Leads are stored in Netlify Blobs (built in, free tier). No database setup is needed. On the very first load, the app fills itself with starter leads from `netlify/lib/seed-leads.mjs` (Pueblo-area foreclosure filings posted by the Colorado Judicial Branch). Their amounts are **original loan amounts**, and the filings are months old, so verify each one with the Public Trustee before acting.

## API (for your agent app or a scanner)

No key needed by default. If you set `ACCESS_KEY` in Netlify, send it as the header `x-access-key`.

| Method | URL | Body | Does |
|---|---|---|---|
| GET | `/api/leads` | none | Returns `{ leads: [...] }` |
| POST | `/api/leads` | `{ "leads": [ {...} ] }` | Adds new leads and updates existing ones. Your status and notes are kept. |
| PATCH | `/api/leads?id=ID` | `{ "status": "Contacted", "notes": "..." }` | Updates one lead |
| DELETE | `/api/leads?id=ID` | none | Removes a lead |

Lead fields: `amountOwed, address, city, county, zip, leadType (Pre-foreclosure | Tax-delinquent | Both), keyDate (YYYY-MM-DD), status, estValue, propertyType (Single-family | Duplex-4plex | Condo/Townhome), owner, ownerMailing, caseNumber, sourceUrl, notes, lat, lng, lender, taxOwed`.

Leads with the same county and case number count as the same lead. Without a case number, the county and address are used instead. So re-importing the same scan never makes duplicates.

Example for your agent app (Node):

```js
await fetch("https://YOUR-SITE.netlify.app/api/leads", {
  method: "POST",
  headers: { "content-type": "application/json", "x-access-key": process.env.LEAD_FINDER_KEY },
  body: JSON.stringify({ leads: [{ address: "123 Main St", city: "Pueblo", county: "Pueblo",
    amountOwed: 84000, leadType: "Pre-foreclosure", keyDate: "2027-01-13", caseNumber: "2026-0123" }] })
});
```

## Where leads come from (official county sources)

- **Pre-foreclosures:** each county's Public Trustee foreclosure search (Jefferson, Larimer, Pueblo, El Paso). Larimer also posts a weekly pre-sale list with the lender's bid.
- **Tax-delinquent:** each county Treasurer's delinquent list and its annual tax lien sale list, published in the fall.
- **Value and owner mailing address:** the county Assessor.

## Legal note

If a home is in foreclosure, Colorado's Foreclosure Protection Act (C.R.S. 6-1-1101 and after) can apply to buying it. It requires a written contract with required notices, gives the owner a right to cancel, and prohibits misleading statements. Have a real estate attorney review your contract and your outreach letter before your first deal.

## Letters

- **⋯ → Letter settings:** your name, company, phone, email and return address. These go on every letter. The defaults are Leslie / Graceful OM LLC.
- **Print:** open a lead → ✉️ Owner letter → 🖨 Print, or use ⋯ → Print letters for all Saved ♥ leads (one page per lead). The recipient address is placed for a standard #10 window envelope, so test-fold one letter first.
- **Mail it for me (Lob):** add `LOB_API_KEY` and `MAIL_PIN` in Netlify, then redeploy. A `test_` key creates previews only and nothing is mailed. A live key prints, mails and charges per letter. The app asks for your PIN and shows a confirmation every time before it sends.
- **Phone numbers:** public records don't include them. Each lead has a Phone field for numbers owners give you.
