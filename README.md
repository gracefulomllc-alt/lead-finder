# Lead Finder

A private web app that lists distressed properties (pre-foreclosures and tax-delinquent properties) in Arvada (Jefferson Co.), Loveland (Larimer Co.), Pueblo (Pueblo Co.) and Colorado Springs (El Paso Co.). It sorts them by **amount owed, cheapest first**.

**Features:** filters by city, lead type, property type and status · Pipeline board (New → Reviewed → Contacted → Offer Made → Dead) · Map with color-coded pins · Owner letter and door-script generator · Import (JSON or CSV) · CSV export · Notes on each lead.

## Deploy (GitHub → Netlify)

1. Create a new GitHub repo (for example `lead-finder`, **private**) and upload everything in this folder.
2. In Netlify, go to **Add new site → Import from Git**, pick the repo, and leave the build settings alone. `netlify.toml` already handles them.
3. In Netlify, go to **Site configuration → Environment variables** and add `ACCESS_KEY` set to a long random password. This one key locks both the app and the API.
4. Redeploy. Open the site, tap 🔑, and enter your key. The key is saved on that device.

Leads are stored in Netlify Blobs (built in, free tier). No database setup is needed.

## API (for your agent app or a scanner)

Every request needs the header `x-access-key: <ACCESS_KEY>`.

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
