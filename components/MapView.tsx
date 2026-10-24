"use client";
import dynamic from"next/dynamic";import type{Issue,Report}from"../lib/types";
const MapInner=dynamic(()=>import("./MapInner"),{ssr:false,loading:()=> <div style={{height:"100%",display:"grid",placeItems:"center",background:"#e8e3d8",fontWeight:700}}>Loading map…</div>});
export default function MapView(props:{issues:Issue[];reports:Report[];raw:boolean}){return <MapInner {...props}/>}
