import { readFile } from "node:fs/promises";
import type { Report } from "../../lib/types";
import { clusterReports } from "../../lib/cluster";
import { naiveClusters } from "../../lib/cluster/baseline";
import { buildIssues } from "../../lib/issues";

export const dynamic = "force-dynamic";

function pairMetrics(reports: Report[], clusters: Report[][]) {
  const membership = new Map<string, number>();
  clusters.forEach((cluster, index) => cluster.forEach((report) => membership.set(report.id, index)));
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < reports.length; i++) for (let j = i + 1; j < reports.length; j++) {
    const actual = reports[i].truthIssueId === reports[j].truthIssueId;
    const predicted = membership.get(reports[i].id) === membership.get(reports[j].id);
    if (actual && predicted) tp++;
    else if (predicted) fp++;
    else if (actual) fn++;
  }
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  return { precision, recall, f1: 2 * precision * recall / (precision + recall || 1) };
}

export default async function HowItWorks() {
  const reports = JSON.parse(await readFile("data/reports.json", "utf8")) as Report[];
  const engine = clusterReports(reports), naive = naiveClusters(reports), issues = buildIssues(reports);
  const truthGroup = (groups: Report[][], truth: string) => groups.find((group) => group.some((report) => report.truthIssueId === truth));
  const truthCount = (groups: Report[][], truth: string) => new Set(reports.filter((report) => report.truthIssueId === truth).map((report) => groups.find((group) => group.some((member) => member.id === report.id)))).size;
  const hero = issues.find((issue) => issue.reportIds.some((id) => reports.find((report) => report.id === id)?.truthIssueId === "S1"));
  const spam = issues.find((issue) => issue.reportIds.some((id) => reports.find((report) => report.id === id)?.truthIssueId === "S7"));
  const engineS3 = new Set(["S3a", "S3b", "S3c"].map((truth) => truthGroup(engine, truth))).size;
  const naiveS3 = new Set(["S3a", "S3b", "S3c"].map((truth) => truthGroup(naive, truth))).size;
  const engineScore = pairMetrics(reports, engine), naiveScore = pairMetrics(reports, naive);
  const rows: [string, string, string][] = [
    ["S1 · hero pothole", truthCount(engine, "S1") === 1 ? "PASS · one issue" : "FAIL", `${hero?.rawCount} reports · ${hero?.uniqueReporters} unique`],
    ["S1/S2 · same-junction category guard", truthGroup(engine, "S1") !== truthGroup(engine, "S2") ? "PASS · separate" : "FAIL", truthGroup(naive, "S1") === truthGroup(naive, "S2") ? "Merged" : "Separate"],
    ["S3 · three potholes along one road", engineS3 === 3 ? "PASS · three issues" : "FAIL", naiveS3 === 1 ? "Chained into one" : `${naiveS3} groups`],
    ["S7 · repeat reporter volume trap", spam && !spam.escalation.eligible ? "PASS · not eligible" : "FAIL", `${spam?.rawCount} reports · ${spam?.uniqueReporters} unique`],
  ];

  return <div style={{ padding: "32px 4vw", maxWidth: 1000, margin: "auto" }}>
    <div className="mono">PLAIN-LANGUAGE ENGINE NOTES</div>
    <h1 style={{ fontSize: 46 }}>How it works</h1>
    <p style={{ fontSize: 19 }}>Report volume is a signal for review, not proof. Every count is shown as reports from unique reporters (unverified).</p>
    <div className="how-grid">
      {[["01 · Category", "Reports only meet within the same civic issue category."], ["02 · Distance", "A report must sit within the category’s link radius of a cluster member."], ["03 · Diameter", "The full issue stays within a maximum diameter, preventing long chains."], ["04 · Text gate", "Beyond the tight same-spot radius, canonicalized descriptions need a small cosine similarity."], ["Reporter rule", "Duplicate reports from one pseudonymous reporter count once toward escalation thresholds."], ["Human review", "Drafts are suggestions; approval and simulated sending are manual steps."]].map(([heading, text]) => <section key={heading} className="border-ink shadow-hard" style={{ padding: 16, background: "white" }}><b className="mono">{heading}</b><p>{text}</p></section>)}
    </div>
    <h2>Current clustering configuration</h2>
    <pre className="border-ink" style={{ padding: 14, overflowX: "auto", background: "white" }}>{JSON.stringify({ pothole: { eps: 25, maxDiameter: 50 }, garbage: { eps: 40, maxDiameter: 80 }, streetlight: { eps: 20, maxDiameter: 40 }, waterlogging: { eps: 70, maxDiameter: 140 }, open_manhole: { eps: 15, maxDiameter: 30 }, broken_footpath: { eps: 30, maxDiameter: 60 }, tightRadiusM: 12, textSimMin: .12 }, null, 2)}</pre>
    <h2>Evaluation traps · guarded engine vs naive baseline</h2>
    <p>The naive baseline uses a 30 m single-link rule and ignores category and diameter limits. It merges the same-junction streetlight and chains the Kothrud potholes.</p>
    <table style={{ borderCollapse: "collapse", width: "100%", background: "white" }}>
      <thead><tr>{["Trap", "Guarded engine", "Naive baseline"].map((label) => <th key={label} style={{ border: "2px solid", padding: 8, textAlign: "left" }}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(([name, status, baseline]) => <tr key={name}><td style={{ border: "1px solid", padding: 8 }}>{name}</td><td style={{ border: "1px solid", padding: 8, fontWeight: 900, color: status.startsWith("PASS") ? "#087a30" : "#b00" }}>{status}</td><td style={{ border: "1px solid", padding: 8 }}>{baseline}</td></tr>)}</tbody>
    </table>
    <p className="mono">PAIRWISE · ENGINE P {Math.round(engineScore.precision * 100)}% · R {Math.round(engineScore.recall * 100)}% · F1 {engineScore.f1.toFixed(3)} · NAIVE F1 {naiveScore.f1.toFixed(3)}</p>
    <p className="mono">CLUSTER COUNTS · ENGINE {engine.length} · NAIVE {naive.length}</p>
    <p>All seed reports are fictional. This is a demo tool, not a legal complaint channel.</p>
  </div>;
}
