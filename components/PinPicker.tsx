"use client";import dynamic from"next/dynamic";
const PinMap=dynamic(()=>import("./PinPickerInner"),{ssr:false,loading:()=> <div style={{height:210,display:"grid",placeItems:"center",background:"#e8e3d8",border:"2px solid"}}>Loading pin map…</div>});
export default function PinPicker({lat,lng,onPick}:{lat:number;lng:number;onPick:(lat:number,lng:number)=>void}){return <PinMap lat={lat} lng={lng} onPick={onPick}/>}
