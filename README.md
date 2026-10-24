# CivicSignal

> **DEMO DATA · Fictional reports and illustrative Pune/PCMC coordinates. Citizen submissions are unverified.**

CivicSignal turns scattered civic reports into a ranked, explainable issue list. Nearby reports can be consolidated for review, while escalation eligibility is based on unique pseudonymous reporters rather than raw volume. Escalations are editable drafts; nothing is sent.

<!-- Screenshot placeholder: add the CivicSignal dashboard screenshot here. -->

## Run locally

Requirements: Node.js 20.9 or newer and npm. No API keys, accounts, database server, or Docker are required.

```bash
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`. OSM tiles need internet access; the marker map remains visible on its plain background when tiles fail. The app persists reports and escalation drafts in JSON files under `data/`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run seed` | Generate deterministic fictional reports |
| `npm test` | Run the clustering and domain unit tests |
| `npm run eval` | Compare clustering to ground truth and a naive baseline |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript strict checks |

## Architecture

- `lib/cluster/` contains pure text normalization, deterministic guarded clustering, abuse flags, and category suggestions.
- `lib/` contains the explainable score, escalation rules, locality anchors, issue projection, and JSON file store.
- `scripts/` generates demo data and measures pairwise precision, recall, F1, and scenario traps.
- `app/` is the Next.js App Router UI and JSON API. The map is a client-only Leaflet view with CircleMarkers; default marker assets are not used.
- `data/reports.json` is committed fictional seed data. `data/state.json` and uploads are ignored.

### Clustering in ten lines

1. Sort reports by creation time, then stable report ID.
2. Consider only clusters with an exact category match.
3. Measure distance to every member using haversine distance.
4. Reject a cluster if its nearest member is outside that category's epsilon.
5. Reject it if adding the report exceeds the category's maximum diameter.
6. Inside the tight radius, accept without a text gate.
7. Outside it, require cosine similarity over normalized description tokens.
8. Attach to the nearest qualifying cluster; ties keep the older cluster.
9. Otherwise create a new cluster; never auto-merge existing clusters.
10. Count reporters uniquely, calculate flags, score and escalation eligibility separately.

## Assumptions

- This build is a local hackathon demo with one Node process and a writable working directory.
- Next.js 16.4 is used as the current active supported line; system font stacks are used so builds do not fetch fonts.
- Reports are pseudonymous browser-local identities, not authenticated people.
- The form keeps optional photo upload out of scope; the evidence grid shows clearly labeled generated placeholders.
- The compact reporter form accepts editable coordinates and browser geolocation rather than a dedicated map pin picker.
- Configuration override sliders and reviewer split/merge tools are outside the first demo cut.
- The offline UI remains useful when map tiles are unavailable; OSM tiles are fetched only from the standard public tile URL.

## Limitations

- All seed data is fictional and coordinates are illustrative.
- Browser location and reporter IDs are user supplied or browser generated; they do not establish identity.
- This version does not accept uploaded photos, so EXIF stripping is not implemented.
- Rate limiting is in-memory and resets when the server restarts.
- JSON persistence is single-process and not safe for concurrent multi-instance deployment; write failures fall back to memory for the session.
- Greedy clustering is deterministic for a fixed report set but order-dependent by design; reviewer correction is important for ambiguous cases.
- This is not a legal complaint channel and does not contact government offices.
- OSM basemap tiles require network access and their public service has usage rules.

## How this could scale

Use a spatial index such as H3 or PostGIS to find candidate issues, retain deterministic incremental assignment, and move JSON writes to a transactional database. Add a real queue for review and notification work, identity controls, moderation and audit trails, and explicit privacy and retention policies before any public deployment.

See [DEMO.md](DEMO.md) for the three-minute walkthrough and judge Q&A.
