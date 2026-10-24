import type { Category } from "./types";
export const DEFAULT_CONFIG = {
 perCategory: { pothole:{eps:25,maxDiameter:50,risk:.70},garbage:{eps:40,maxDiameter:80,risk:.50},streetlight:{eps:20,maxDiameter:40,risk:.50},waterlogging:{eps:70,maxDiameter:140,risk:.70},open_manhole:{eps:15,maxDiameter:30,risk:1},broken_footpath:{eps:30,maxDiameter:60,risk:.40} },
 tightRadiusM:12,textSimMin:.12,escalation:{minUniqueReporters:10,criticalCategoryMin:3,highScoreMin:75,highScoreMinReporters:5},tiers:{critical:75,high:55,medium:35}
} as const;
export type Config = {perCategory:Record<Category,{eps:number;maxDiameter:number;risk:number}>;tightRadiusM:number;textSimMin:number;escalation:{minUniqueReporters:number;criticalCategoryMin:number;highScoreMin:number;highScoreMinReporters:number};tiers:{critical:number;high:number;medium:number}};
