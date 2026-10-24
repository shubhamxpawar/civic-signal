import type { Report } from "./types";
const R=6371000;
export function haversine(a:{lat:number;lng:number},b:{lat:number;lng:number}):number { const p=Math.PI/180, dLat=(b.lat-a.lat)*p,dLng=(b.lng-a.lng)*p,x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
export function centroid(reports:Report[]):{lat:number;lng:number} { return {lat:reports.reduce((s,r)=>s+r.lat,0)/reports.length,lng:reports.reduce((s,r)=>s+r.lng,0)/reports.length}; }
