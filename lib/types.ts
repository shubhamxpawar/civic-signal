export const CATEGORIES = ["pothole", "garbage", "streetlight", "waterlogging", "open_manhole", "broken_footpath"] as const;
export type Category = typeof CATEGORIES[number];
export type Tier = "critical" | "high" | "medium" | "low";
export type Flag = "repeat_reporter" | "photo_reuse" | "burst";
export interface Report { id: string; createdAt: string; lat: number; lng: number; category: Category; description: string; severity: 1|2|3; photoUrl?: string; photoHash?: string; reporterId: string; locality: string; truthIssueId?: string }
export interface Issue { id: string; category: Category; reportIds: string[]; centroid: {lat:number;lng:number}; radiusM:number; locality:string; firstReportAt:string; lastReportAt:string; rawCount:number; uniqueReporters:number; flags:Flag[]; avgSeverity:number; priority:{score:number;tier:Tier;breakdown:Record<string,number>}; status:"open"|"escalation_drafted"|"escalated_simulated"|"resolved"; escalation:{eligible:boolean;reason:string;progress:{have:number;need:number}} }
export interface EscalationDraft { id:string;issueId:string;createdAt:string;to:string;subject:string;body:string;status:"draft"|"approved"|"sent_simulated";generatedBy:"template"|"template+llm" }
