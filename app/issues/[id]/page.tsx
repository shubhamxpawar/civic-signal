import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getIssues, getDrafts, loadReports } from "../../../lib/store";
import { findFlags } from "../../../lib/cluster/flags";
import { DEFAULT_CONFIG } from "../../../lib/config";
import EscalationPanel from "../../../components/EscalationPanel";
import MapView from "../../../components/MapView";

export const dynamic = "force-dynamic";

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [issues, allReports, drafts] = await Promise.all([getIssues(), loadReports(), getDrafts()]);
  const issue = issues.find((candidate) => candidate.id === decodeURIComponent(id));
  if (!issue) notFound();

  const reports = allReports.filter((report) => issue.reportIds.includes(report.id));
  const referenceNow = Math.max(...allReports.map((report) => Date.parse(report.createdAt)));
  const days = Math.max(0, Math.floor((referenceNow - Date.parse(issue.firstReportAt)) / 86400000));
  const recent = reports.filter((report) => referenceNow - Date.parse(report.createdAt) <= 72 * 3600000).length;
  const rawFactors: Record<string, string> = {
    count: `${issue.uniqueReporters} unique reporters`,
    severity: `average ${issue.avgSeverity.toFixed(1)} · category risk ${DEFAULT_CONFIG.perCategory[issue.category].risk.toFixed(2)}`,
    age: `${days} days since first report`,
    recency: `${recent} reports in 72 hours`,
  };
  const dailyCounts = new Map<string, number>();
  for (const report of reports) {
    const day = report.createdAt.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }
  const daily = [...dailyCounts.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxDaily = Math.max(1, ...daily.map(([, count]) => count));
  const flags = findFlags(reports);
  const repeatedPhotos = new Set(reports.filter((report) => report.photoHash).map((report) => report.photoHash)).size;

  return (
    <div style={{ padding: "25px 4vw", maxWidth: 1150, margin: "auto" }}>
      <Link href="/">← Dashboard</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 20 }}>
        <div>
          <div className="mono">{issue.id} · {issue.status.toUpperCase()}</div>
          <h1 style={{ fontSize: 44, margin: "10px 0" }}>{issue.category.replaceAll("_", " ")} <span style={{ color: "#555" }}>· {issue.locality}</span></h1>
          <p style={{ fontSize: 19, fontWeight: 700 }}>{issue.rawCount} reports from {issue.uniqueReporters} unique reporters (unverified)</p>
        </div>
        <div className="shadow-hard border-ink" style={{ padding: 14, background: issue.priority.tier === "critical" ? "#ff3b30" : "#ffd60a" }}>
          <b>{issue.priority.tier.toUpperCase()}</b><div style={{ fontSize: 36, fontWeight: 900 }}>{issue.priority.score}<small style={{ fontSize: 15 }}>/100</small></div>
        </div>
      </div>

      <div className="detail-grid">
        <section>
          <div className="border-ink shadow-hard" style={{ height: 350, overflow: "hidden" }}><MapView issues={[issue]} reports={reports} raw /></div>
          <h2>Evidence · {reports.length} submissions</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {reports.filter((report) => report.photoUrl).map((report) => <figure key={report.id} style={{ margin: 0, border: "2px solid", background: "white" }}><Image src={report.photoUrl ?? `/api/placeholder/${report.id}`} alt="Fictional placeholder photo" width={150} height={100} unoptimized /><figcaption className="mono" style={{ fontSize: 10, padding: 4 }}>DEMO PHOTO</figcaption></figure>)}
            {!reports.some((report) => report.photoUrl) && <p>No placeholder photos for this issue.</p>}
          </div>
          <h3>Reports by day</h3>
          <svg role="img" aria-label="Report count by day" viewBox="0 0 600 140" style={{ width: "100%", border: "2px solid", background: "white" }}>
            {daily.map(([day, count], index) => {
              const slot = 560 / Math.max(daily.length, 1);
              const height = (count / maxDaily) * 86;
              const x = 20 + index * slot;
              return <g key={day}><title>{day}: {count} reports</title><rect x={x} y={100 - height} width={Math.max(4, slot - 8)} height={height} fill="#2d5bff" stroke="#0a0a0a" strokeWidth="2" /><text x={x} y="124" fontSize="10">{day.slice(5)}</text></g>;
            })}
          </svg>
          <div className="border-ink" style={{ padding: 12, marginTop: 12, background: "white" }}>
            <b>Review flags</b><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
              {flags.includes("repeat_reporter") && <span className="mono border-ink" style={{ padding: "4px 7px", background: "#ffd60a" }}>REPEAT REPORTER · {issue.rawCount - issue.uniqueReporters}</span>}
              {flags.includes("photo_reuse") && <span className="mono border-ink" style={{ padding: "4px 7px", background: "#ff9f1c" }}>PHOTO REUSE · {reports.filter((report) => report.photoHash).length - repeatedPhotos}</span>}
              {flags.includes("burst") && <span className="mono border-ink" style={{ padding: "4px 7px", background: "#ff3b30" }}>BURST DETECTED</span>}
              {flags.length === 0 && <span>No flags</span>}
            </div>
          </div>
          <h2>Reports</h2>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
            <thead><tr>{["Time", "Reporter", "Description", "Severity"].map((label) => <th key={label} style={{ border: "2px solid", padding: 8, textAlign: "left" }}>{label}</th>)}</tr></thead>
            <tbody>{reports.map((report) => <tr key={report.id}>{[new Date(report.createdAt).toLocaleString(), report.reporterId, report.description, `${report.severity}/3`].map((value, index) => <td key={index} style={{ border: "1px solid #555", padding: 8 }}>{value}</td>)}</tr>)}</tbody>
          </table></div>
        </section>

        <aside>
          <section className="border-ink shadow-hard" style={{ padding: 18, background: "white", marginBottom: 18 }}>
            <h2>Priority breakdown</h2>
            {Object.entries(issue.priority.breakdown).map(([factor, value]) => <div key={factor} style={{ margin: "14px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><b>{factor.toUpperCase()}</b><span className="mono">{value.toFixed(2)}</span></div>
              <div className="mono" style={{ fontSize: 11, color: "#444" }}>{rawFactors[factor]}</div>
              <div style={{ height: 12, border: "2px solid", marginTop: 4 }}><div style={{ width: `${value * 100}%`, height: "100%", background: "#2d5bff" }} /></div>
            </div>)}
          </section>
          <EscalationPanel issue={issue} initial={drafts.find((draft) => draft.issueId === issue.id) ?? null} />
        </aside>
      </div>
    </div>
  );
}
