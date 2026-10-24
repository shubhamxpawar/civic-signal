# CivicSignal · 3-minute demo

Keep the persistent **DEMO DATA** banner visible throughout. The seed reports and map points are fictional and illustrative.

## Click path

1. **Problem · 20 s:** Open Dashboard. “An officer may receive dozens of reports for one street problem. CivicSignal groups nearby reports so the queue is easier to review.”
2. **Toggle · 30 s:** Select **Raw reports**, then **Consolidated issues**. Point out the hero: **40 reports from 31 unique reporters (unverified)**. Explain that consolidation is a review aid, not proof.
3. **Traps · 40 s:** Open How it works. Show the same-junction streetlight staying separate from the pothole and the three Kothrud potholes staying three issues. Compare the engine with the naive single-link baseline in the evaluation section.
4. **Honesty · 30 s:** Return to Dashboard and open the Wakad issue. Show **11 reports from 3 unique reporters**, repeat reporter and photo reuse flags, and that it is not escalation eligible.
5. **Escalation · 30 s:** Open the hero issue, select **Generate draft**, inspect its recipient, facts and caveat, then **Approve**. Point out that the status is simulated and no email is sent. Optionally mark as sent (simulated).
6. **Live · 30 s:** Open Report. Submit a pothole report near Baner; show the issue result and updated count. The dashboard reload reflects the persisted JSON report.

## Fallbacks

- **Tiles fail:** the Leaflet canvas keeps its plain background and markers; attribution remains visible.
- **No venue network:** run the demo after `npm install` and `npm run seed`; only the OSM basemap needs network. Keep a short screen recording of the toggle and escalation flow as a backup.
- **Report IDs change after reseeding:** reopen the Dashboard and follow issue links from the visible ranked list.

## Likely judge questions

- **How do you stop spam?** We do not treat raw volume as proof. Counts use unique pseudonymous reporters, and repeat reporter, burst, and photo reuse flags help a human review suspicious clusters.
- **Why not ML?** A deterministic, inspectable distance and text gate is easier to explain and evaluate for this small demo. A language model never decides duplicate membership or escalation eligibility.
- **What if two real potholes get merged?** The diameter and nearest-member guards limit chaining; a real deployment needs a reviewer correction flow and audit trail.
- **What about privacy?** The seed data is fictional, reporters use local pseudonymous IDs, and no real officials or complaint data are present. A public system needs a retention policy, moderation and stronger privacy controls.
- **How does it scale?** Replace neighborhood scans and single-process JSON files with a spatial index such as H3/PostGIS, transactional storage and a review queue while preserving deterministic assignment and an audit trail.
