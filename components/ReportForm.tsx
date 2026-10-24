"use client";

import { useState } from "react";
import { CATEGORIES, type Category } from "../lib/types";
import { suggestCategory } from "../lib/cluster/suggest";
import PinPicker from "./PinPicker";

function getReporterId() {
  let id = localStorage.getItem("civicsignal-reporter");
  if (!id) {
    id = `citizen-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    localStorage.setItem("civicsignal-reporter", id);
  }
  return id;
}

export default function ReportForm() {
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<Category>("pothole");
  const [severity, setSeverity] = useState("2");
  const [lat, setLat] = useState("18.5590");
  const [lng, setLng] = useState("73.7868");
  const [result, setResult] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, description: desc, severity, lat, lng, reporterId: getReporterId() }),
    });
    const data = await response.json();
    setResult(response.ok
      ? `${data.joinedExisting ? `Added to existing issue ${data.issueId} — now ` : "New issue created — "}${data.issueSummary.rawCount} reports from ${data.issueSummary.uniqueReporters} unique reporters (unverified).`
      : data.error);
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (position) => { setLat(String(position.coords.latitude)); setLng(String(position.coords.longitude)); },
      () => setResult("Location permission unavailable. Enter coordinates manually."),
    );
  }

  function updateDescription(value: string) {
    setDesc(value);
    if (value.trim()) setCategory(suggestCategory(value).category);
  }

  return <form onSubmit={submit} className="border-ink shadow-hard" style={{ background: "white", padding: 22, display: "grid", gap: 16, maxWidth: 620 }}>
    <label><b>What needs attention?</b><textarea required minLength={8} maxLength={500} value={desc} onChange={(event) => updateDescription(event.target.value)} style={{ display: "block", width: "100%", height: 110, border: "2px solid", padding: 10, marginTop: 6 }} placeholder="Describe what you saw…" /></label>
    <label><b>Category</b><select value={category} onChange={(event) => setCategory(event.target.value as Category)} style={{ display: "block", width: "100%", border: "2px solid", padding: 10, marginTop: 6 }}>{CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    <div className="mono">Suggested category · {category}</div>
    <div><b>Location pin · tap the map to place it</b><PinPicker lat={Number(lat)} lng={Number(lng)} onPick={(latitude, longitude) => { setLat(latitude.toFixed(6)); setLng(longitude.toFixed(6)); }} /><div style={{ display: "flex", gap: 8, marginTop: 8 }}><input aria-label="Latitude" value={lat} onChange={(event) => setLat(event.target.value)} style={{ width: "50%", border: "2px solid", padding: 9 }} /><input aria-label="Longitude" value={lng} onChange={(event) => setLng(event.target.value)} style={{ width: "50%", border: "2px solid", padding: 9 }} /></div><button type="button" onClick={locate} style={{ padding: "8px 0", textDecoration: "underline", border: 0, background: "none" }}>Use my location</button></div>
    <label><b>Severity</b><select value={severity} onChange={(event) => setSeverity(event.target.value)} style={{ display: "block", width: "100%", border: "2px solid", padding: 10, marginTop: 6 }}><option value="1">1 · Minor</option><option value="2">2 · Serious</option><option value="3">3 · Dangerous</option></select></label>
    <div className="mono">REPORTING AS A BROWSER PSEUDONYM · STORED IN THIS BROWSER</div>
    <button className="button-press shadow-hard border-ink" style={{ padding: 12, background: "#ffd60a", fontWeight: 900 }}>SUBMIT REPORT</button>
    {result && <div role="status" className="border-ink" style={{ padding: 13, background: "#22c55e", fontWeight: 800 }}>{result}</div>}
  </form>;
}
