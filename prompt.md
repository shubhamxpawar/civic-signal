# CivicSignal — Build Spec

You are the sole engineer building **CivicSignal** for a hackathon (track: *Civic & Community Tools*). Total wall-clock budget is **4–5 hours**. Feature-complete target is **3h 45m**; the rest is buffer for bugs, polish and demo rehearsal. Read this whole file before writing code. Do not ask clarifying questions: make the most reasonable decision, write it down in `README.md` under "Assumptions", and keep moving.

---

## 1. Product

**One-liner:** CivicSignal turns scattered citizen complaints into prioritised, evidence-backed civic issues — 40 photos of one pothole become **one ranked issue with a count**, and when a threshold is crossed, an **escalation draft** is generated for a human to review.

**Users**
- **Citizen reporter** (mobile, 30 seconds): submits category, description, location pin, optional photo.
- **Ward officer / reviewer** (desktop): sees ranked issues on a map, inspects evidence, approves escalations.

**The demo moment (design everything around this):** toggle the map from *Raw reports* (~180 dots) to *Consolidated issues* (~35 markers). The hero marker says "40 reports · 31 unique reporters". Click it → evidence, score breakdown, escalation draft.

**Honesty rule (non-negotiable, shapes copy everywhere):** report volume is not proof. The UI must always say *"N reports from M unique reporters (unverified)"*. Never use words like "verified", "confirmed" or "consensus". Escalation thresholds count **unique reporters**, not raw reports. All seed data is fictional and must be labelled **DEMO DATA** in a persistent banner.

---

## 2. Hard constraints

1. **Free only.** No paid services, no credit card, no API key required to run. `GEMINI_API_KEY` is *optional* (only for polishing escalation prose); everything must work without it.
2. **No auth, no database server, no Docker, no native modules.** Persistence is JSON files on disk.
3. **Deterministic dedupe.** An LLM must never decide whether two reports are duplicates.
4. **Works offline after `npm install`**, except OSM map tiles. If tiles fail (venue wifi), the map must still render markers on a plain background.
5. **TypeScript strict mode.** No `any` in `lib/`.
6. No geocoding API. Locality labels come from a hard-coded list of Pune/PCMC localities (nearest by haversine).
7. Be a good citizen of OSM's public tile servers: standard `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, correct attribution (`© OpenStreetMap contributors`), no bulk prefetching, no tile scraping.

---

## 3. Stack

- Next.js (latest stable, App Router) + React + TypeScript (strict)
- Tailwind CSS (no component library — hand-build the neo-brutalist components)
- `leaflet` + `react-leaflet` (client-only: `dynamic(() => import(...), { ssr: false })`; import `leaflet/dist/leaflet.css`; **do not use default marker icons** — use `CircleMarker` / `divIcon`, the default icon paths break under bundlers)
- `zod` for request validation
- `vitest` for unit tests, `tsx` for scripts (`seed`, `eval`)
- Fonts: `Space Grotesk` (UI) + `JetBrains Mono` (numbers/labels) via `next/font`, with system fallbacks so the build never depends on network success
- Package manager: `npm`

---

## 4. Domain model (`lib/types.ts`)

```ts
type Category =
  | "pothole" | "garbage" | "streetlight"
  | "waterlogging" | "open_manhole" | "broken_footpath";

interface Report {
  id: string;              // "r_0001"
  createdAt: string;       // ISO
  lat: number; lng: number;
  category: Category;
  description: string;     // English / Hinglish / Marathi-in-Roman allowed
  severity: 1 | 2 | 3;     // 1 minor, 2 serious, 3 dangerous
  photoUrl?: string;
  photoHash?: string;      // sha256 of uploaded bytes (seed: fake hashes, some deliberately reused)
  reporterId: string;      // pseudonymous, e.g. "u_017"
  locality: string;        // nearest known locality
  truthIssueId?: string;   // seed only; ground truth for eval; NEVER shown in UI
}

interface Issue {
  id: string;              // "ISS-" + id of earliest member report (stable)
  category: Category;
  reportIds: string[];
  centroid: { lat: number; lng: number };
  radiusM: number;         // max member distance from centroid
  locality: string;
  firstReportAt: string; lastReportAt: string;
  rawCount: number;
  uniqueReporters: number;
  flags: Flag[];           // see 5.5
  avgSeverity: number;
  priority: { score: number; tier: "critical"|"high"|"medium"|"low"; breakdown: Record<string, number> };
  status: "open" | "escalation_drafted" | "escalated_simulated" | "resolved";
  escalation: { eligible: boolean; reason: string; progress: { have: number; need: number } };
}

interface EscalationDraft {
  id: string; issueId: string; createdAt: string;
  to: string; subject: string; body: string;
  status: "draft" | "approved" | "sent_simulated";
  generatedBy: "template" | "template+llm";
}
```

---

## 5. Clustering engine — the core (`lib/cluster/`)

Pure functions, zero I/O, fully unit-tested. This is what judges will probe, so it must be correct and explainable.

### 5.1 Config (`lib/config.ts`, overridable via `data/state.json`)

```ts
export const DEFAULT_CONFIG = {
  // metres. eps = max link distance to the NEAREST member; maxDiameter = max distance between ANY two members
  perCategory: {
    pothole:         { eps: 25, maxDiameter: 50,  risk: 0.70 },
    garbage:         { eps: 40, maxDiameter: 80,  risk: 0.50 },
    streetlight:     { eps: 20, maxDiameter: 40,  risk: 0.50 },
    waterlogging:    { eps: 70, maxDiameter: 140, risk: 0.70 },
    open_manhole:    { eps: 15, maxDiameter: 30,  risk: 1.00 },
    broken_footpath: { eps: 30, maxDiameter: 60,  risk: 0.40 },
  },
  tightRadiusM: 12,       // within this, skip the text gate (same spot is same spot)
  textSimMin: 0.12,       // cosine gate beyond tightRadius
  escalation: { minUniqueReporters: 10, criticalCategoryMin: 3, highScoreMin: 75, highScoreMinReporters: 5 },
  tiers: { critical: 75, high: 55, medium: 35 },
};
```

### 5.2 Algorithm: guarded incremental leader clustering

Do **not** use plain DBSCAN or single-linkage connected components: they chain (three potholes 70 m apart along one road collapse into one issue). Use this instead:

```
sort reports by (createdAt asc, id asc)           // deterministic
clusters = []
for r in sorted:
  best = null
  for c in clusters where c.category == r.category:
    dMin = min haversine(r, m) over members m of c
    if dMin > eps[cat]:                                  continue   // too far from every member
    if diameterIfAdded(c, r) > maxDiameter[cat]:         continue   // anti-chaining guard
    if dMin > tightRadiusM and textSim(r, c) < textSimMin: continue // text gate
    if best == null or dMin < best.dMin: best = {c, dMin}           // nearest wins; tie -> older cluster
  if best: add r to best.c else: clusters.push(new cluster from r)
```

Rules:
- **Category must match exactly.** A streetlight and a pothole at identical coordinates are different issues.
- **Never auto-merge two existing clusters** (a "bridge" report attaches to the nearest one only). Merging is a reviewer action only.
- Result must be **identical for identical input** (add a determinism test that shuffles input order and expects the same clusters, since step 1 sorts).
- O(n·k) is fine for n ≤ a few thousand.

### 5.3 Text similarity (`lib/cluster/text.ts`)

1. Lowercase, strip punctuation/digits, split on whitespace.
2. Remove stopwords (English + Hinglish: `hai hain ka ki ke yaha yahan bahut bahot pe par me mein se ko aur ye woh the is a an on at of and near please`, extend sensibly).
3. Canonicalise synonyms via a map, e.g.: `khadda gadda gaddha khaddha crater hole potholes → pothole`; `kachra kooda trash waste dump garbage → garbage`; `pani flooding flooded bhar jam → water`; `batti lamp light → light`; `band off andhera dark → dark`; `manhole dhakkan cover → manhole`; `footpath pavement sidewalk → footpath`. Extend the map; keep it in one file.
4. Light suffix stemming (`s`, `es`, `ing`).
5. Term-frequency vectors; cluster vector = sum of member vectors; **cosine similarity**.

Short descriptions yield low scores, which is exactly why `tightRadiusM` bypasses the gate. Tune `textSimMin` against the eval harness (section 9), not by guessing.

### 5.4 Category suggestion (`lib/cluster/suggest.ts`)

Keyword-count classifier using the same canonical tokens. Used only to **pre-select** the category dropdown on the report form; the user can change it. Return `{ category, confidence }`.

### 5.5 Duplicate / abuse flags (computed per issue)

- `repeat_reporter`: same `reporterId` appears > 1 time → counts **once** toward `uniqueReporters`.
- `photo_reuse`: same `photoHash` from different reporters (possible copy-paste).
- `burst`: ≥ 3 reports from one reporter within 5 minutes.
- Display flags as small badges; they never delete data, they only affect `uniqueReporters` and are shown to the reviewer.

### 5.6 Reviewer overrides (P1)

Stored in `data/state.json`: `isolate: string[]` (report ids forced into their own issue) and `mergeGroups: string[][]` (reports forced into one issue). Applied **after** clustering. Issue id stays "ISS-" + earliest member.

---

## 6. Prioritisation (`lib/priority.ts`)

All inputs normalised to 0–1, explainable, and the breakdown is shown in the UI.

```
countScore    = min(1, ln(1 + uniqueReporters) / ln(1 + 30))
severityScore = 0.5 * ((avgSeverity - 1) / 2) + 0.5 * categoryRisk
ageScore      = min(1, daysSince(firstReportAt) / 14)       // old and unresolved gets worse
recencyScore  = min(1, reportsInLast72h / 5)                // still being reported
score = round(100 * (0.40*countScore + 0.30*severityScore + 0.15*ageScore + 0.15*recencyScore))
tier: >=75 critical, >=55 high, >=35 medium, else low
```

`now` must be injectable (tests/eval use a fixed `now`).

---

## 7. Escalation (`lib/escalation.ts`)

**Eligible if any:**
1. `uniqueReporters >= 10`
2. `category == "open_manhole"` and `uniqueReporters >= 3`
3. `priority.score >= 75` and `uniqueReporters >= 5`

`escalation.progress` = `{ have: uniqueReporters, need: 10 }` (or the rule closest to being met) so the UI can show "7 / 10 unique reporters".

**Department routing table** (static, labelled "suggested"): pothole/broken_footpath → Roads / Ward Office; garbage → Solid Waste Management; streetlight → Electrical; waterlogging → Drainage / Storm Water; open_manhole → Drainage + Roads (urgent safety). Do not name real officials. Header text: *"Suggested recipient — demo only, nothing is actually sent."*

**Draft generation — template first, LLM optional:**
- The template produces the whole draft deterministically: `Subject`, `To`, issue summary, location (locality, lat/lng, OSM link `https://www.openstreetmap.org/?mlat=..&mlon=..#map=19/..`), evidence block (raw reports, unique reporters, first/last report dates, photo count, flags), priority tier + score reasons, **requested action with a suggested timeframe by tier**, and a mandatory caveat paragraph: *"These are unverified citizen submissions. X repeat/duplicate submissions were excluded from the unique-reporter count. A field inspection is requested to confirm."*
- If `GEMINI_API_KEY` is set: send **only** the structured facts and ask the model to rewrite the one narrative paragraph in a formal tone, forbidding new facts. After the call, programmatically check that every number in the output exists in the facts; if not, discard the LLM paragraph and keep the template. Set `generatedBy: "template+llm"` only if it passes. If the key is absent or the call fails, silently use the template.
- Status flow: `draft → approved → sent_simulated`. A human clicks each step. Approving shows a confirmation ("Simulated — no email is sent").

---

## 8. Seed data (`scripts/seed.ts` → `data/reports.json`)

Deterministic (seeded PRNG, fixed seed). Timestamps are relative to the moment the seed runs (so ages look right in a live demo). Coordinates are **approximate** locality centres in Pune/PCMC; jitter is applied in metres. Put a comment saying coordinates are illustrative and the data is fictional.

Approximate locality anchors (for jitter centres and for the nearest-locality labeller): Shivajinagar (18.5308, 73.8475), Deccan (18.5167, 73.8416), Swargate (18.5018, 73.8636), Kothrud (18.5074, 73.8077), Aundh (18.5580, 73.8075), Baner (18.5590, 73.7868), Wakad (18.5974, 73.7898), Hinjewadi (18.5912, 73.7389), Pimpri (18.6279, 73.8009), Viman Nagar (18.5679, 73.9143), Kharadi (18.5511, 73.9406), Hadapsar (18.5089, 73.9260), Katraj (18.4575, 73.8677). Add ~10 more if useful.

**Scenarios (each report carries a `truthIssueId`):**

| ID | Scenario | Reports | Unique reporters | Purpose |
|---|---|---|---|---|
| S1 | **Hero:** big pothole at a Baner junction, jitter σ≈8 m (max ≈20 m), spread over 9 days, ~12 with placeholder photos, a few shared photo hashes | 40 | ~31 | The headline demo. Must escalate. |
| S2 | **Trap A:** broken streetlight at the *same junction*, ≤5 m from S1 centre | 7 | 6 | Must NOT merge with S1 (category guard). |
| S3 | **Trap B:** three separate potholes along one Kothrud road, centres ~70 m and ~80 m apart | 7 / 6 / 5 | 6 / 5 / 4 | Must stay **three** issues (anti-chaining). |
| S4 | Garbage dump, Hadapsar, radius ≈35 m | 18 | ~14 | Escalates (rule 1). |
| S5 | Waterlogging at Katraj underpass, spread ≈60 m | 14 | ~11 | Escalates; tests the larger eps. |
| S6 | Open manhole, Shivajinagar, severity 3 | 4 | 4 | Escalates via critical rule (rule 2) with only 4 reporters. |
| S7 | **Spam/volume trap:** pothole in Wakad, 9 reports from **one** reporter + 2 others, reused photo hash | 11 | 3 | Raw count ≥ 10 but must **NOT** escalate. Proves "volume ≠ consensus". |
| S8 | Noise: ~55 singletons and pairs across all localities, including two potholes ~45 m apart (must stay separate) | ~55 | — | Realism + false-merge tests. |

Total ≈ 170–200 reports. Descriptions must be varied realistic English/Hinglish, e.g. "Bahut bada khadda junction ke paas, bike slip ho gayi", "Huge pothole near signal, water fills it when it rains", "Street light band hai 3 hafte se", "Kachra utha hi nahi raha 5 din se", "Underpass me pani bhar gaya, gadi band ho jaati hai". Write ≥ 40 distinct templates and combine them.

Seed photos: no real images. Generate deterministic placeholder SVGs from `/api/placeholder/[seed]` (coloured tile, category icon, text "DEMO PHOTO"). Never imply they are real.

---

## 9. Evaluation harness (`scripts/eval.ts`, `npm run eval`) — our differentiator

1. Run the engine on the seed with a fixed `now`.
2. Compute **pairwise precision / recall / F1** against `truthIssueId` (a pair is positive if both reports share a truth id).
3. Also run a **naive baseline** (single-linkage, 30 m, ignores category, no diameter guard) and print both.
4. Print the traps explicitly: S1/S2 merged? S3 resolved to 3 issues? S7 escalated? Each as PASS/FAIL.
5. Exit non-zero if our F1 < 0.95 or any trap fails.

Expected outcome: ours ≥ 0.95 F1; naive visibly worse (it merges S1+S2 and chains S3). Show the same table on the `/how-it-works` page (computed at build or on request). Tune `textSimMin`, eps values and seed generation **until this passes**, but do not weaken the traps to make it pass.

Unit tests (vitest) must cover: haversine; each trap; determinism under shuffled input; unique-reporter counting; each escalation rule; priority tiers at boundaries; text normalisation (Hinglish synonyms); diameter guard; category suggestion.

---

## 10. Pages & UX

All pages carry the persistent **DEMO DATA** banner and a slim nav: Dashboard · Report · Escalations · How it works.

### `/` Dashboard
- **Stat strip:** `N reports → M issues (K× consolidation)` · unique reporters · escalations eligible · escalations drafted.
- **Map (≈60% width, full width on mobile)** with a segmented toggle **Raw reports | Consolidated issues** (default: Consolidated). Raw = small dots coloured by category. Consolidated = circle markers sized `~sqrt(rawCount)`, coloured by tier, count rendered inside. Fit bounds to data on load. Animate the transition between modes if cheap (opacity fade is enough). Tiles failing must not break anything.
- **Ranked list (≈40%)**: sorted by priority score desc. Each row: tier chip, category, locality, `N reports · M unique reporters (unverified)`, age, escalation state ("7 / 10" progress or "Eligible"). Clicking a row flies the map to it and highlights the marker; clicking a marker scrolls the list to the row.
- **Filters:** category chips, tier, status, "min unique reporters" slider. URL-synced query params.

### `/issues/[id]`
- Header: category, locality, tier chip, score, status.
- Mini map with member report dots + radius circle.
- **Score breakdown** (4 horizontal bars: count/severity/age/recency, each with the raw number behind it).
- **Evidence:** photo grid (placeholders labelled), reports-per-day bar chart (inline SVG, no chart lib), flags panel (repeat reporter / photo reuse / burst, with counts).
- **Reports table:** time, reporter (pseudonymous), description, severity, flag badges.
- **Escalation panel:** if not eligible → progress bar to threshold with the plain-language rule. If eligible → **Generate draft** → editable textarea with Copy / Download `.txt` / **Approve** → **Mark as sent (simulated)**.
- (P1) Reviewer controls: *Split this report out*, *Merge into another issue* (select).

### `/report/new` (mobile-first)
- Category select (auto-suggested live from description), description, severity (1–3 with plain labels), map pin picker (click to place; **Use my location** via `navigator.geolocation`), optional photo (≤ 2 MB, jpg/png/webp).
- On submit: re-cluster and show a result card — either **"Added to existing issue ISS-xxxx — now 41 reports from 32 unique reporters"** (link) or **"New issue created."** This is the live-demo wow moment; make it prominent.
- Reporter identity: random pseudonymous id in `localStorage` ("Reporting as Citizen #A3F9"). Server-side zod validation; reject out-of-range coordinates; light per-IP in-memory rate limit (e.g. 10/min).
- Photos are saved to `data/uploads/` and served through a route handler `GET /api/uploads/[name]` (files added to `public/` after build are **not** served by `next start`). Compute sha256 for `photoHash`.

### `/escalations`
Table of all drafts with status, issue link, created time.

### `/how-it-works`
Plain-language explanation of the algorithm (the 4 guards: category, eps, diameter, text gate), the unique-reporter rule, current config values, and the **eval table** (ours vs naive baseline, trap PASS/FAIL). (P1) sliders to change eps/thresholds with live re-cluster.

---

## 11. API (route handlers, zod-validated)

- `GET /api/issues` — ranked issues (supports filter params)
- `GET /api/issues/[id]` — issue + member reports + escalation draft if any
- `GET /api/reports` — raw reports (for the raw map layer)
- `POST /api/reports` — create report → returns `{ report, issueId, joinedExisting, issueSummary }`
- `POST /api/issues/[id]/escalation` — generate (or regenerate) draft; 409 if not eligible
- `PATCH /api/escalations/[id]` — status transition (`approved`, `sent_simulated`) or edited body
- `GET /api/uploads/[name]`, `GET /api/placeholder/[seed]`
- `POST /api/admin/reseed` — dev only; guard with `NODE_ENV !== "production"` or an env flag
- (P1) `POST /api/issues/[id]/split`, `POST /api/issues/merge`, `GET|PATCH /api/config`

**Store (`lib/store.ts`):** in-memory cache loaded from `data/reports.json` + `data/state.json` (`escalations`, `overrides`, `config`). Writes are write-through with atomic temp-file rename, wrapped in try/catch — if the filesystem is read-only (e.g. serverless), keep working in memory and surface a small "read-only demo mode" notice. Issues are recomputed from reports on demand (cache by a version counter bumped on every write).

---

## 12. Design system — neo-brutalist

- Palette: paper `#F4F0E6`, ink `#0A0A0A`, signal yellow `#FFD60A`, alert red `#FF3B30`, orange `#FF9F1C`, blue `#2D5BFF`, green `#22C55E`. Tier colours: critical red, high orange, medium yellow, low blue-grey.
- Thick 2–3 px black borders, **hard offset shadows** (`box-shadow: 4px 4px 0 #0A0A0A`), zero or tiny border radius, flat fills, no gradients, no blur.
- Space Grotesk for headings/body, JetBrains Mono for counts, IDs, coordinates and labels. Big numbers, uppercase micro-labels.
- Buttons press down (translate + shadow collapse) on hover/active.
- Responsive: the dashboard stacks (map above list) under 1024 px; the report form must be comfortable at 375 px width.
- Basic a11y: visible focus rings, buttons are buttons, contrast ≥ 4.5:1 for body text, map has a text alternative (the ranked list is the accessible equivalent).

---

## 13. Folder structure

```
app/
  layout.tsx  page.tsx
  report/new/page.tsx
  issues/[id]/page.tsx
  escalations/page.tsx
  how-it-works/page.tsx
  api/...                       (route handlers from section 11)
components/
  Map/ (MapView.tsx, IssueLayer.tsx, RawLayer.tsx, PinPicker.tsx)
  ui/  (Card, Button, Chip, Stat, Banner, Progress, Badge)
  IssueList.tsx  ScoreBreakdown.tsx  EvidenceGrid.tsx  ReportsTable.tsx
  EscalationPanel.tsx  ReportForm.tsx  ConsolidationToggle.tsx
lib/
  types.ts  config.ts  geo.ts  priority.ts  escalation.ts  store.ts  localities.ts
  cluster/ (index.ts, text.ts, suggest.ts, flags.ts, baseline.ts)
scripts/ seed.ts  eval.ts
tests/   *.test.ts
data/    reports.json  state.json  uploads/   (gitignore uploads and state.json; commit reports.json)
README.md  DEMO.md  prompt.md
```

---

## 14. Build phases (time-boxed, each ends with a green gate and a git commit)

| Phase | Time | Work | Gate |
|---|---|---|---|
| 0 | 0:00–0:20 | Scaffold Next+TS+Tailwind, deps, folders, types, config, fonts, DEMO DATA banner, git init | `npm run dev` renders a blank branded page |
| 1 | 0:20–1:30 | `geo`, `text`, `cluster`, `flags`, `priority`, `escalation`, `baseline`, `localities`, `seed.ts`, `eval.ts`, unit tests | `npm test` green **and** `npm run eval` passes (F1 ≥ 0.95, all traps PASS). **Do not start UI until this passes.** |
| 2 | 1:30–2:30 | Store, API routes, dashboard: stat strip, Leaflet map, Raw/Consolidated toggle, ranked list, filters, selection sync | Toggle shows ~180 dots ↔ ~35 markers; hero reads 40 reports |
| 3 | 2:30–3:15 | Issue detail page, score breakdown, evidence, escalation panel + template draft, status flow, Escalations page | Hero issue → generate → approve → simulated sent |
| 4 | 3:15–3:45 | Report form (map pin, geolocation, suggestion, upload), live join/new-issue result card, mobile pass | Submitting near the hero joins it and count goes 40→41 |
| 5 | 3:45–4:30 | Polish neo-brutalist details, `/how-it-works` + eval table, empty/error/loading states, README, DEMO.md, `npm run build` + `npm start` smoke test, P1 items if time remains | Production build runs clean on a cold clone |

If you are behind schedule at any gate, apply the cut list immediately; do not carry debt forward.

---

## 15. Cut list (cut from the top first)

1. Gemini polish of escalation prose
2. Config sliders on `/how-it-works`
3. Split / merge reviewer controls
4. Photo upload on the report form (keep the rest of the form)
5. `/escalations` page (link to drafts from issue pages instead)
6. Tier and status filters (keep category chips)

**Never cut:** the engine, the eval harness, the Raw/Consolidated toggle, the issue detail page, template-based escalation drafts, the report form (even without photos), the unique-reporter honesty copy, the DEMO DATA banner.

---

## 16. Acceptance checklist (verify each before declaring done)

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run eval`, `npm run build` all pass
- [ ] Hero issue shows 40 reports / ~31 unique reporters, tier critical, escalation eligible
- [ ] S2 streetlight is a **separate** issue from the S1 pothole
- [ ] S3 renders as **three** issues
- [ ] S7 (11 raw reports, 3 unique) is **not** escalation-eligible and shows the repeat-reporter + photo-reuse flags
- [ ] S6 open manhole is eligible with only 4 reporters, and the UI states the rule that made it eligible
- [ ] Submitting a new report near the hero joins it live; submitting far away creates a new issue
- [ ] Map works with tiles blocked (disable network in devtools and reload)
- [ ] 375 px viewport: report form and dashboard are usable
- [ ] No page uses the words "verified" or "confirmed" about citizen reports
- [ ] `git clone` → `npm install` → `npm run seed` → `npm run dev` works with **no** env vars

---

## 17. Documents to produce

- **README.md:** what it is, screenshots placeholder, setup, scripts (`dev`, `build`, `start`, `seed`, `test`, `eval`), architecture overview, the algorithm in ~10 lines, **Assumptions**, **Limitations** (illustrative coordinates, fictional data, no EXIF stripping on uploads, in-memory rate limit, single-process JSON store, order-dependent greedy clustering, not a legal complaint channel), and **how this would scale** (spatial index such as H3/PostGIS, incremental assignment, a real queue, auth, moderation).
- **DEMO.md:** a 3-minute script with exact clicks and talking points:
  1. *Problem (20 s):* "40 people report one pothole; the officer sees 40 tickets."
  2. *Toggle (30 s):* Raw → Consolidated, hero = 40 reports / 31 unique.
  3. *Traps (40 s):* streetlight at same junction stays separate; three potholes stay three; naive baseline fails these (show the eval table).
  4. *Honesty (30 s):* the spam case — 11 reports, 3 people, not escalated.
  5. *Escalation (30 s):* open the hero, generate the draft, approve (simulated).
  6. *Live (30 s):* submit a report from a phone, watch the count tick up.
  Also include a **fallback plan** (tiles don't load → markers still work; backup screen recording) and **likely judge questions with short answers** (How do you stop spam? Why not ML? What if two real potholes get merged? Privacy? How does it scale?).

---

## 18. Do-not list

- Do not add auth, payments, email sending, real government integrations, real-time sockets, or a database server.
- Do not let an LLM decide duplicates or eligibility.
- Do not use real people's names, real officials, or real complaint data.
- Do not present report counts as verification.
- Do not spend more than 15 minutes stuck on any single bug: simplify, stub, note it in README, move on.
- Do not weaken the eval traps to make tests pass.
- Do not leave `console.log` debugging or `TODO` placeholders in shipped UI text.

Work phase by phase. At the end of each phase, run the gate, commit with a clear message, and continue. When done, print a summary: what works, what was cut, known issues.
